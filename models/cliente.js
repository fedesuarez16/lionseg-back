const mongoose = require('mongoose');

// Define un esquema para los clientes
const clienteSchema = new mongoose.Schema({
  name: String,
  email: String,
  phoneNumber: String,
  invoiceLinks: [
    {
      fileName: String,
      state: { type: String, default: 'pending' },
      registrationDate: Date,
      expirationDate: Date,
    },
  ],
  services: [
    {
      producto: String,
      firstPaymentAmount: Number,
      price: Number,
      invoiceCycle: String,
      paymentMethod: String,
      domains: [String],
    },
  ],
  creationDate: Date,
  state: { type: String, enum: ['activo', 'inactivo'], default: 'activo' }, // Updated
});

const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;
