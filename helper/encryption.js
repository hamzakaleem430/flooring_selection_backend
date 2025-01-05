import bcrypt from "bcrypt";
import crypto from "crypto";

// Hashed Password
export const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.log(error);
  }
};

// Compare Password
export const comparePassword = async (password, hashPassword) => {
  return await bcrypt.compare(password, hashPassword);
};

// Rendom Token
export const createRandomToken = () => {
  const resetToken = crypto.randomBytes(32).toString("hex");
  crypto.createHash("sha256").update(resetToken).digest("hex");

  return resetToken;
};
