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
      total: Number, // Añadir el campo 'total' para cada factura
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
  totalIngresos: { type: Number, default: 0 }, // Nuevo campo para los ingresos totales
});

const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;
