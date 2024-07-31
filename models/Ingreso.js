const mongoose = require('mongoose');

const IngresoSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const Ingreso = mongoose.model('Ingreso', IngresoSchema);

module.exports = Ingreso;
