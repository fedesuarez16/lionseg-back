const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const Cliente = require('./models/cliente'); // Import the Cliente model
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const cron = require('node-cron'); // Importa node-cron
const transporter = require('./nodemailerConfig');

// Connect to your MongoDB database
mongoose.connect('mongodb+srv://fedesuarez16:Fedesss10@mydb.m6gwsyc.mongodb.net/?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const app = express();
const port = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors({
  origin: ['https://lionseg-erp.vercel.app', 'http://localhost:3000'] // Añade todos los orígenes permitidos aquí
}));

app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));

// Create a new client
app.post('/api/clientes', async (req, res) => {
  try {
    const cliente = new Cliente(req.body);
    await cliente.save();
    res.status(201).json(cliente);
  } catch (error) {
    res.status(400).json({ error: error });
  }
});

// Get all clients
app.get('/api/clientes', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    let clients;
    const searchRegex = new RegExp(searchQuery, 'i');
    if (searchQuery) {
      clients = await Cliente.find({
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { phoneNumber: { $regex: searchRegex } },
        ],
      });
    } else {
      clients = await Cliente.find();
    }
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve clients' });
  }
});

// Get a single client by ID
app.get('/api/clientes/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const cliente = await Cliente.findById(id);
    if (!cliente) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve client' });
  }
});

// Update a client by ID
app.put('/api/clientes/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const cliente = await Cliente.findByIdAndUpdate(id, req.body, { new: true });
    if (!cliente) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Could not update client' });
  }
});

// Delete a client by ID
app.delete('/api/clientes/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const cliente = await Cliente.findByIdAndRemove(id);
    if (!cliente) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Could not delete client' });
  }
});

// Create a new invoice for a client
app.post('/api/clientes/:id/invoices', async (req, res) => {
  const clientId = req.params.id;
  try {
    const cliente = await Cliente.findById(clientId);
    if (!cliente) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Add the new invoice to the client's invoices array
    cliente.invoiceLinks.push(req.body);
    await cliente.save();

    res.status(201).json(cliente.invoiceLinks[cliente.invoiceLinks.length - 1]); // Return the newly created invoice
  } catch (error) {
    res.status(500).json({ error: 'Could not create invoice' });
  }
});

// Generate invoices for all active clients
app.post('/api/generar-facturas', async (req, res) => {
  try {
    // Filtrar solo clientes activos
    const clientes = await Cliente.find({ state: 'activo' });

    const enlacesFacturas = [];

    for (const cliente of clientes) {
      const doc = new PDFDocument();
      const fileName = `factura_${cliente._id}_${Date.now()}.pdf`;

      const dirFacturas = 'public/facturas';
      if (!fs.existsSync(dirFacturas)) {
        const dirPublic = 'public';
        if (!fs.existsSync(dirPublic)) {
          fs.mkdirSync(dirPublic);
        }
        fs.mkdirSync(dirFacturas);
      }

      doc.pipe(fs.createWriteStream(`public/facturas/${fileName}`));

      // Add logo
      const logoPath = 'C:\Users\fedes\clients-panel\server\logo.png'; // Replace with the path to your logo server\logo.png
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, {
          fit: [150, 150],
          align: 'center',
          valign: 'center'
        });
      }

      // Get the current date and calculate the expiration date
      const invoiceDate = new Date();
      const expirationDate = new Date();
      expirationDate.setDate(invoiceDate.getDate() + 7); // 7 days from the invoice date

      const service = cliente.services.length > 0 ? cliente.services[0] : {};

      const invoiceNumber = `INV-${Date.now()}`;

   // Add invoice details to the PDF
doc.fontSize(20).text(`Factura para: ${cliente.name}`, { align: 'center' });
doc.moveDown(1.5);  // Espacio entre el título y los textos debajo

doc.fontSize(16).text(`Número de Factura: ${invoiceNumber}`, { align: 'left' });
doc.moveDown(0.5);
doc.fontSize(16).text(`Fecha de la Factura: ${invoiceDate.toDateString()}`, { align: 'left' });
doc.moveDown(0.5);
doc.fontSize(16).text(`Fecha de Vencimiento: ${expirationDate.toDateString()}`, { align: 'left' });
doc.moveDown(2);  // Espacio después de las fechas

doc.fontSize(16).text(`Datos del Cliente:`, { align: 'left', underline: true });
doc.moveDown(0.5);
doc.fontSize(14).text(`Nombre: ${cliente.name}`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`Email: ${cliente.email}`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`Teléfono: ${cliente.phoneNumber}`, { align: 'left' });
doc.moveDown(2);  // Espacio después de los datos del cliente

doc.fontSize(16).text(`Servicio: ${service.producto || 'N/A'}`, { align: 'left', underline: true });
doc.moveDown(0.5);
doc.fontSize(14).text(`Monto a Pagar:`, { align: 'left' })
  .font('Helvetica-Bold').text(`${service.price || 0}`, { align: 'left' });
doc.moveDown(2);  // Espacio después del monto a pagar

doc.font('Helvetica').fontSize(14).text(`Detalles del Servicio: ${service.domains ? service.domains.join(', ') : 'N/A'}`, { align: 'left' });
doc.moveDown(2);  // Espacio después de los detalles del servicio

doc.fontSize(14).text(`Método de Pago: ${service.paymentMethod || 'N/A'}`, { align: 'left' });
doc.moveDown(2);  // Espacio después del método de pago

// Add bank details
doc.fontSize(16).text(`Banco Patagonia:`, { align: 'left', underline: true });
doc.moveDown(0.5);
doc.fontSize(14).text(`Alias: PAJARO.SABADO.LARGO`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`CBU: 0340040108409895361003`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`Cuenta: CA $  040-409895361-000`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`CUIL: 20224964162`, { align: 'left' });
doc.moveDown(2);  // Espacio después de los detalles del banco

// Add Mercado Pago details
doc.fontSize(16).text(`Mercado Pago:`, { align: 'left', underline: true });
doc.moveDown(0.5);
doc.fontSize(14).text(`Alias: lionseg.mp`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`CVU: 0000003100041927153583`, { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(14).text(`Número: 1125071506 (Jorge Luis Castillo)`, { align: 'left' });
doc.moveDown(2);  // Espacio después de los detalles de Mercado Pago

doc.end();

      const invoice = {
        fileName,
        state: 'pending',
        registrationDate: invoiceDate,
        expirationDate,
        invoiceNumber,
        total: service.price || 0,
      };

      cliente.invoiceLinks.push(invoice);
      await cliente.save();

      console.log(`Factura generada para ${cliente.name}`);

      const facturaLink = `https://localhost:3000/facturas/${fileName}`; // Cambiar a HTTPS si es necesario
      enlacesFacturas.push(facturaLink);

      await transporter.sendMail({
        from: 'coflipweb@gmail.com',
        to: cliente.email,
        subject: 'Factura',
        text: 'Se adjunta la factura.',
        attachments: [{ filename: fileName, path: `./public/facturas/${fileName}` }],
      });
    }

    console.log('Facturas generadas con éxito');
    res.status(200).json({ message: 'Facturas generadas con éxito', enlacesFacturas });
  } catch (error) {
    console.error('Error al generar las facturas:', error);
    res.status(500).json({ error });
  }
});

// Define the route to update the state of an invoice link
app.put('/api/clientes/:clienteId/invoiceLinks/:invoiceLinkId/state', async (req, res) => {
  const { clienteId, invoiceLinkId } = req.params;
  const { state } = req.body;

  try {
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const invoiceLink = cliente.invoiceLinks.id(invoiceLinkId);
    if (!invoiceLink) {
      return res.status(404).json({ error: 'Invoice link not found' });
    }

    invoiceLink.state = state;
    await cliente.save();

    res.status(200).json(invoiceLink);
  } catch (error) {
    res.status(500).json({ error: 'Could not update invoice link state' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
