import ejs from "ejs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sendMail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    service: process.env.SMTP_SERVICE,
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const { email, subject, template, data } = options;

  const templatePath = join(__dirname, "../mail", template);
  const html = await ejs.renderFile(templatePath, data);

  const message = {
    from: process.env.SMTP_MAIL,
    to: email,
    subject,
    html,
  };

  const info = await transporter.sendMail(message);
  console.log("Message sent: %s", info.messageId);
};

export default sendMail;
