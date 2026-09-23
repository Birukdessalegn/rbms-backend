const pool = require("../../config/database");

/**
 * Helper to determine the start and end timestamp for a timeframe filter,
 * taking into account the venue's night-shift window (6:00 PM to 7:00 AM).
 */
const getTimeframeBounds = (timeframe = "today") => {
  const now = new Date();
  const currentHour = now.getHours();

  // If before 7:00 AM, today's business date is yesterday
  const businessDate = new Date(now);
  if (currentHour < 7) {
    businessDate.setDate(businessDate.getDate() - 1);
  }

  let startTime = null;
  let endTime = null;

  switch (timeframe.toLowerCase()) {
    case "today": {
      // Start of business shift: 07:00 AM of business date
      const start = new Date(businessDate);
      start.setHours(7, 0, 0, 0);
      startTime = start.toISOString();
      break;
    }
    case "yesterday": {
      const yDate = new Date(businessDate);
      yDate.setDate(yDate.getDate() - 1);
      const start = new Date(yDate);
      start.setHours(7, 0, 0, 0);
      const end = new Date(businessDate);
      end.setHours(6, 59, 59, 999);
      startTime = start.toISOString();
      endTime = end.toISOString();
      break;
    }
    case "week": {
      const start = new Date(businessDate);
      start.setDate(start.getDate() - 7);
      start.setHours(7, 0, 0, 0);
      startTime = start.toISOString();
      break;
    }
    case "month": {
      const start = new Date(businessDate);
      start.setDate(start.getDate() - 30);
      start.setHours(7, 0, 0, 0);
      startTime = start.toISOString();
      break;
    }
    case "all":
    default:
      startTime = null;
      endTime = null;
      break;
  }

  return { startTime, endTime };
};

/**
 * Generate full Cost Analysis, COGS %, Margins, and Menu Engineering Matrix
 */
const getCostAnalysis = async ({ timeframe = "today", department = "all" } = {}) => {
  const { startTime, endTime } = getTimeframeBounds(timeframe);

  // 1. Fetch sales performance aggregated from order_items with timeframe bounds
  const salesQuery = `
    SELECT
      oi.product_id,
      COALESCE(SUM(oi.quantity), 0) AS total_sold_qty,
      COALESCE(SUM(oi.total), 0) AS total_sales_revenue,
      COUNT(DISTINCT oi.order_id) AS orders_count
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.status::text NOT IN ('cancelled', 'void')
      AND (
        o.payment_status::text = 'paid'
        OR o.status::text = 'completed'
      )
      AND ($1::timestamp IS NULL OR o.created_at >= $1::timestamp)
      AND ($2::timestamp IS NULL OR o.created_at <= $2::timestamp)
    GROUP BY oi.product_id
  `;

  const salesRes = await pool.query(salesQuery, [startTime, endTime]);
  const salesMap = new Map();
  salesRes.rows.forEach((row) => {
    salesMap.set(Number(row.product_id), {
      soldQty: parseFloat(row.total_sold_qty || 0),
      salesRevenue: parseFloat(row.total_sales_revenue || 0),
      ordersCount: parseInt(row.orders_count || 0, 10),
    });
  });

  // 2. Fetch all products and their categories
  const productsQuery = `
    SELECT
      p.id,
      p.product_code,
      p.name,
      p.category_id,
      COALESCE(pc.name, 'Uncategorized') AS category_name,
      LOWER(COALESCE(pc.type, 'food')) AS category_type,
      COALESCE(p.price, 0) AS selling_price,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.unit, 'pcs') AS unit,
      p.serving_size,
      p.portion_ratio,
      p.is_available,
      p.is_active,
      p.image_url
    FROM products p
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE p.is_active = true
    ORDER BY p.name ASC
  `;

  const productsRes = await pool.query(productsQuery);

  // Department Aggregators
  const deptStats = {
    food: { revenue: 0, cost: 0, count: 0 },
    bar: { revenue: 0, cost: 0, count: 0 },
    fruit: { revenue: 0, cost: 0, count: 0 },
    other: { revenue: 0, cost: 0, count: 0 },
  };

  let grandTotalRevenue = 0;
  let grandTotalCost = 0;
  let uncostedItemsCount = 0;

  // 3. Enrich items with costs, margins, and status
  const itemizedAnalysis = productsRes.rows.map((prod) => {
    const sData = salesMap.get(Number(prod.id)) || {
      soldQty: 0,
      salesRevenue: 0,
      ordersCount: 0,
    };

    const sellingPrice = parseFloat(prod.selling_price || 0);
    const costPrice = parseFloat(prod.cost_price || 0);
    const soldQty = sData.soldQty;
    const itemRevenue = sData.salesRevenue > 0 ? sData.salesRevenue : soldQty * sellingPrice;
    const itemCost = soldQty * costPrice;
    const grossProfitEtb = itemRevenue - itemCost;

    // Determine normalized department bucket
    let normDept = "food";
    const catNameLower = (prod.category_name || "").toLowerCase();
    const catTypeLower = (prod.category_type || "").toLowerCase();

    if (
      catNameLower.includes("fruit") ||
      catTypeLower === "fruit" ||
      prod.name.toLowerCase().includes("fruit") ||
      prod.name.toLowerCase().includes("head")
    ) {
      normDept = "fruit";
    } else if (
      catTypeLower === "bar" ||
      catTypeLower === "beverage" ||
      catNameLower.includes("bar") ||
      catNameLower.includes("drink") ||
      catNameLower.includes("wine") ||
      catNameLower.includes("liquor") ||
      catNameLower.includes("cocktail") ||
      catNameLower.includes("beer")
    ) {
      normDept = "bar";
    } else {
      normDept = "food";
    }

    // Accumulate department stats
    if (deptStats[normDept]) {
      deptStats[normDept].revenue += itemRevenue;
      deptStats[normDept].cost += itemCost;
      deptStats[normDept].count += soldQty;
    }

    grandTotalRevenue += itemRevenue;
    grandTotalCost += itemCost;

    if (costPrice <= 0) {
      uncostedItemsCount += 1;
    }

    // Unit margin & cost %
    const unitGrossProfit = Math.max(sellingPrice - costPrice, 0);
    const unitMarginPercent = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
    const unitCostPercent = sellingPrice > 0 ? (costPrice / sellingPrice) * 100 : 0;

    // Margin Health Tag
    let marginStatus = "healthy";
    if (costPrice <= 0) {
      marginStatus = "uncosted";
    } else if (unitMarginPercent >= 70) {
      marginStatus = "star";
    } else if (unitMarginPercent >= 55) {
      marginStatus = "healthy";
    } else {
      marginStatus = "low_margin";
    }

    return {
      id: prod.id,
      productCode: prod.product_code,
      name: prod.name,
      categoryName: prod.category_name,
      department: normDept,
      sellingPrice,
      costPrice,
      unit: prod.unit,
      soldQty,
      ordersCount: sData.ordersCount,
      totalRevenue: itemRevenue,
      totalCost: itemCost,
      grossProfit: grossProfitEtb,
      unitGrossProfit,
      marginPercent: Math.round(unitMarginPercent * 10) / 10,
      costPercent: Math.round(unitCostPercent * 10) / 10,
      marginStatus,
      imageUrl: prod.image_url,
    };
  });

  // 4. Menu Engineering Matrix Classification
  // Calculate average popularity (sold quantity) and average gross profit
  const activeSoldItems = itemizedAnalysis.filter((item) => item.soldQty > 0);
  const avgSoldQty =
    activeSoldItems.length > 0
      ? activeSoldItems.reduce((acc, i) => acc + i.soldQty, 0) / activeSoldItems.length
      : 1;
  const avgGrossProfit =
    activeSoldItems.length > 0
      ? activeSoldItems.reduce((acc, i) => acc + i.unitGrossProfit, 0) / activeSoldItems.length
      : 50;

  const engineeredItems = itemizedAnalysis.map((item) => {
    let quadrant = "puzzle"; // Low volume, high profit default
    const isHighVolume = item.soldQty >= avgSoldQty;
    const isHighProfit = item.unitGrossProfit >= avgGrossProfit;

    if (isHighVolume && isHighProfit) {
      quadrant = "star"; // ⭐ High Volume, High Margin (Promote heavily)
    } else if (isHighVolume && !isHighProfit) {
      quadrant = "workhorse"; // 🚜 High Volume, Low Margin (Raise price or decrease portion)
    } else if (!isHighVolume && isHighProfit) {
      quadrant = "puzzle"; // 🧩 Low Volume, High Margin (Upsell / reposition)
    } else {
      quadrant = "underperformer"; // 📉 Low Volume, Low Margin (Re-engineer or eliminate)
    }

    return {
      ...item,
      quadrant,
    };
  });

  // Filter items by department if requested
  const filteredItems =
    department === "all"
      ? engineeredItems
      : engineeredItems.filter((i) => i.department === department);

  // 5. Compute Department Benchmarks
  const foodCostPercent =
    deptStats.food.revenue > 0
      ? Math.round((deptStats.food.cost / deptStats.food.revenue) * 1000) / 10
      : 0;

  const barCostPercent =
    deptStats.bar.revenue > 0
      ? Math.round((deptStats.bar.cost / deptStats.bar.revenue) * 1000) / 10
      : 0;

  const fruitCostPercent =
    deptStats.fruit.revenue > 0
      ? Math.round((deptStats.fruit.cost / deptStats.fruit.revenue) * 1000) / 10
      : 0;

  const overallGrossMargin = grandTotalRevenue - grandTotalCost;
  const overallMarginPercent =
    grandTotalRevenue > 0
      ? Math.round((overallGrossMargin / grandTotalRevenue) * 1000) / 10
      : 0;
  const overallCostPercent =
    grandTotalRevenue > 0
      ? Math.round((grandTotalCost / grandTotalRevenue) * 1000) / 10
      : 0;

  return {
    timeframe,
    department,
    summary: {
      totalRevenue: grandTotalRevenue,
      totalCogs: grandTotalCost,
      grossProfit: overallGrossMargin,
      overallMarginPercent,
      overallCostPercent,
      uncostedItemsCount,
      totalMenuItems: productsRes.rows.length,
      activeSoldItemsCount: activeSoldItems.length,
      benchmarks: {
        food: {
          revenue: deptStats.food.revenue,
          cost: deptStats.food.cost,
          costPercent: foodCostPercent,
          targetRange: "28% – 35%",
          status: foodCostPercent <= 35 ? "optimal" : "warning",
        },
        bar: {
          revenue: deptStats.bar.revenue,
          cost: deptStats.bar.cost,
          costPercent: barCostPercent,
          targetRange: "18% – 25%",
          status: barCostPercent <= 25 ? "optimal" : "warning",
        },
        fruit: {
          revenue: deptStats.fruit.revenue,
          cost: deptStats.fruit.cost,
          costPercent: fruitCostPercent,
          targetRange: "15% – 20%",
          status: fruitCostPercent <= 20 ? "optimal" : "warning",
        },
      },
      quadrants: {
        starsCount: engineeredItems.filter((i) => i.quadrant === "star").length,
        workhorsesCount: engineeredItems.filter((i) => i.quadrant === "workhorse").length,
        puzzlesCount: engineeredItems.filter((i) => i.quadrant === "puzzle").length,
        underperformersCount: engineeredItems.filter((i) => i.quadrant === "underperformer").length,
      },
    },
    items: filteredItems,
  };
};

/**
 * Quick inline update for a product's purchase/cost price
 */
const updateProductCostPrice = async (productId, costPrice) => {
  const parsedCost = parseFloat(costPrice);
  if (isNaN(parsedCost) || parsedCost < 0) {
    throw new Error("Cost price must be a non-negative number.");
  }

  const result = await pool.query(
    `
    UPDATE products
    SET
      cost_price = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, name, price, cost_price, unit
    `,
    [parsedCost, productId]
  );

  if (result.rows.length === 0) {
    throw new Error("Product not found.");
  }

  return result.rows[0];
};

module.exports = {
  getCostAnalysis,
  updateProductCostPrice,
};
