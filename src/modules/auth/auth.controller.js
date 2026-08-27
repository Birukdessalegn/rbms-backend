const authService = require("./auth.service");

const register = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      roleId,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const user = await authService.registerUser({
      username,
      email,
      password,
      roleId,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const result = await authService.loginUser(
      username,
      password
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    console.error(error);

    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
};