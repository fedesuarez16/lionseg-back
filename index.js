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

      
      doc.image(logoPath, { fit: [100, 100], align: 'right' });
      
      doc.fontSize(20).text(`Factura para: ${cliente.name}`, { align: 'center' });
      doc.moveDown(2);
      
      // Add invoice metadata
      doc.fontSize(14).text(`Número de Factura: ${invoiceNumber}`, { align: 'left' });
      doc.fontSize(14).text(`Fecha de la Factura: ${invoiceDate.toDateString()}`, { align: 'left' });
      doc.fontSize(14).text(`Fecha de Vencimiento: ${expirationDate.toDateString()}`, { align: 'left' });
      doc.moveDown(2);
      
      // Add client details
      doc.fontSize(14).text(`Datos del Cliente:`, { align: 'left', underline: true });
      doc.fontSize(12).text(`Nombre: ${cliente.name}`, { align: 'left' });
      doc.fontSize(12).text(`Email: ${cliente.email}`, { align: 'left' });
      doc.fontSize(12).text(`Teléfono: ${cliente.phoneNumber}`, { align: 'left' });
      doc.moveDown(2);
      
      // Add service details in table format
      doc.fontSize(14).text(`Detalles del Servicio:`, { align: 'left', underline: true });
      doc.moveDown(0.5);
      
      const tableTop = doc.y;
      const itemDescriptionX = 50;
      const itemPriceX = 300;
      
      // Table header
      doc.fontSize(12).fillColor('black').text('Descripción', itemDescriptionX, tableTop);
      doc.fontSize(12).fillColor('black').text('Precio', itemPriceX, tableTop);
      
      const tableRow = (y, description, price, isEven) => {
        const bgColor = isEven ? '#f3f3f3' : '#e0e0e0';
        doc.rect(40, y - 10, 500, 20).fill(bgColor).stroke();
        doc.fillColor('black').fontSize(12)
          .text(description, itemDescriptionX, y)
          .text(price, itemPriceX, y);
      };
      
      // Adding service details to the table with alternating row colors
      const services = [
        { description: service.producto || 'N/A', price: service.price || 0 }
      ];
      
      services.forEach((item, index) => {
        const y = tableTop + 20 + index * 20;
        tableRow(y, item.description, item.price, index % 2 === 0);
      });
      
      doc.moveDown(2);
      
      // Add total amount
      doc.fontSize(14).fillColor('black').text(`Monto Total:`, { align: 'left' });
      doc.fontSize(14).text(`$ ${service.price || 0}`, { align: 'left', continued: true }).font('Helvetica-Bold').text(`${service.price || 0}`);
      doc.moveDown(2);
      
      // Add payment methods in two columns
      doc.fontSize(14).fillColor('black').text(`Métodos de Pago:`, { align: 'left', underline: true });
      doc.moveDown(0.5);
      
      const columnTop = doc.y;
      const leftColumnX = 50;
      const rightColumnX = 300;
      
      // Banco Patagonia details
      doc.fontSize(12).fillColor('black').text(`Banco Patagonia:`, leftColumnX, columnTop);
      doc.fontSize(12).fillColor('black').text(`Alias: PAJARO.SABADO.LARGO`, leftColumnX, columnTop + 15);
      doc.fontSize(12).fillColor('black').text(`CBU: 0340040108409895361003`, leftColumnX, columnTop + 30);
      doc.fontSize(12).fillColor('black').text(`Cuenta: CA $  040-409895361-000`, leftColumnX, columnTop + 45);
      doc.fontSize(12).fillColor('black').text(`CUIL: 20224964162`, leftColumnX, columnTop + 60);
      
      // Mercado Pago details
      doc.fontSize(12).fillColor('black').text(`Mercado Pago:`, rightColumnX, columnTop);
      doc.fontSize(12).fillColor('black').text(`Alias: lionseg.mp`, rightColumnX, columnTop + 15);
      doc.fontSize(12).fillColor('black').text(`CVU: 0000003100041927153583`, rightColumnX, columnTop + 30);
      doc.fontSize(12).fillColor('black').text(`Número: 1125071506 (Jorge Luis Castillo)`, rightColumnX, columnTop + 45);
      
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
