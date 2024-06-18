// nodemailerConfig.js

const nodemailer = require('nodemailer');

// Configura el transporter para enviar correos electrónicos
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'coflipweb@gmail.com', // Tu dirección de correo electrónico
    pass: 'dmkc mafg dzpb jzzs', // Tu contraseña de correo electrónico
  },
});

module.exports = transporter;
