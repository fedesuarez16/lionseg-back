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
      const logoPath = 'C:\\Users\\fedes\\clients-panel\\server\\logo.png'; // Replace with the path to your logo server\logo.png
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 50 });
      }

      // Add invoice title
      doc.fontSize(20).text('Factura', 110, 57);

      // Add invoice metadata
      const invoiceDate = new Date();
      const expirationDate = new Date();
      expirationDate.setDate(invoiceDate.getDate() + 7); // 7 days from the invoice date
      const invoiceNumber = `INV-${Date.now()}`;

      doc.fontSize(10)
        .text(`Fecha de la Factura: ${invoiceDate.toLocaleDateString()}`, 200, 65, { align: 'right' })
        .text(`Fecha de Vencimiento: ${expirationDate.toLocaleDateString()}`, 200, 80, { align: 'right' })
        .text(`Número de Factura: ${invoiceNumber}`, 200, 95, { align: 'right' });

      doc.moveDown(2);

      // Add client details
      doc.text(`Facturado a:`, 50, 160)
        .text(`${cliente.name}`, 50, 175)
        .text(`${cliente.address || 'Dirección no proporcionada'}`, 50, 190)
        .text(`${cliente.city || ''}, ${cliente.state || ''}, ${cliente.zip || ''}`, 50, 205)
        .text(`${cliente.country || 'País no proporcionado'}`, 50, 220);

      doc.moveDown(2);

      // Add service details
      const service = cliente.services.length > 0 ? cliente.services[0] : {};
      const services = [
        { description: service.producto || 'N/A', price: service.price || 0 }
      ];

      doc.text('Descripción', 50, 280, { bold: true })
        .text('Total', 450, 280, { align: 'right', bold: true });

      services.forEach((item, index) => {
        const y = 300 + index * 20;
        doc.text(item.description, 50, y)
          .text(`$${item.price.toFixed(2)} ARS`, 450, y, { align: 'right' });
      });

      const subTotal = services.reduce((sum, item) => sum + item.price, 0);
      const recargo = subTotal * 0.1;
      const total = subTotal + recargo;

      doc.moveDown(2);

      // Add totals
      doc.text(`Sub Total: $${subTotal.toFixed(2)} ARS`, 400, 400, { align: 'right' })
        .text(`Recargo por falta de pago a término: $${recargo.toFixed(2)} ARS`, 400, 415, { align: 'right' })
        .text(`Total: $${total.toFixed(2)} ARS`, 400, 430, { align: 'right', bold: true });

      // Add payment methods
      doc.moveDown(2).text(`Métodos de Pago:`, 50, 500)
        .text(`Banco Patagonia:`, 50, 515)
        .text(`Alias: PAJARO.SABADO.LARGO`, 50, 530)
        .text(`CBU: 0340040108409895361003`, 50, 545)
        .text(`Cuenta: CA $ 040-409895361-000`, 50, 560)
        .text(`CUIL: 20224964162`, 50, 575)
        .text(`Mercado Pago:`, 300, 515)
        .text(`Alias: lionseg.mp`, 300, 530)
        .text(`CVU: 0000003100041927153583`, 300, 545)
        .text(`Número: 1125071506 (Jorge Luis Castillo)`, 300, 560);

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