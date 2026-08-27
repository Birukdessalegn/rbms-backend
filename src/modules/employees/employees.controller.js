const employeesService = require("./employees.service");


// GET /api/employees
const getEmployees = async (req, res) => {
  try {
    const employees = await employeesService.getAllEmployees();

    res.json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    console.error("Get employees error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
    });
  }
};


// GET /api/employees/:id
const getEmployee = async (req, res) => {
  try {
    const employee = await employeesService.getEmployeeById(
      req.params.id
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      employee,
    });
  } catch (error) {
    console.error("Get employee error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch employee",
    });
  }
};


// POST /api/employees
const createEmployee = async (req, res) => {
  try {
    const {
      employeeCode,
      firstName,
      lastName,
      username,
      password,
      roleId,
    } = req.body;

    if (!employeeCode || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message:
          "Employee code, first name and last name are required",
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Username and password are required for the employee login",
      });
    }

    if (!roleId) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    const result =
      await employeesService.createEmployee(req.body);

    res.status(201).json({
      success: true,
      message:
        "Employee and login account created successfully",

      employee: result.employee,

      user: result.user,
    });

  } catch (error) {
    console.error("Create employee error:", error);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


// PUT /api/employees/:id
const updateEmployee = async (req, res) => {
  try {
    const employee = await employeesService.updateEmployee(
      req.params.id,
      req.body
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      message: "Employee updated successfully",
      employee,
    });
  } catch (error) {
    console.error("Update employee error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update employee",
    });
  }
};

// PUT /api/employees/:id/activate
const activateEmployee = async (req, res) => {
  try {
    const employee = await employeesService.activateEmployee(
      req.params.id
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      message: "Employee activated successfully",
      employee,
    });

  } catch (error) {
    console.error("Activate employee error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to activate employee",
    });
  }
};
// DELETE /api/employees/:id
const deleteEmployee = async (req, res) => {
  try {
    const employee = await employeesService.deleteEmployee(
      req.params.id
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete employee error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete employee",
    });
  }
};


module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  activateEmployee,
};