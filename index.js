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

      // Add service details with table structure
      const tableTop = 280;
      const itemCodeX = 50;
      const descriptionX = 50;
      const unitPriceX = 450;

      // Add table headers
      doc.fontSize(12).fillColor('black')
        .text('Descripción', descriptionX, tableTop, { bold: true })
        .text('Total', unitPriceX, tableTop, { align: 'right', bold: true });

      // Draw header background
      doc.rect(itemCodeX, tableTop - 5, unitPriceX - itemCodeX + 100, 20)
        .fill('#f0f0f0')
        .stroke();

      // Add table rows
      const service = cliente.services.length > 0 ? cliente.services[0] : {};
      const services = [
        { description: service.producto || 'N/A', price: service.price || 0 }
      ];

      services.forEach((item, index) => {
        const y = tableTop + 25 + (index * 25);
        const fillColor = index % 2 === 0 ? '#e6e6e6' : '#cccccc';

        // Draw row background
        doc.rect(itemCodeX, y - 5, unitPriceX - itemCodeX + 100, 25)
          .fill(fillColor)
          .stroke();

        doc.fillColor('black')
          .text(item.description, descriptionX, y)
          .text(`$${item.price.toFixed(2)} ARS`, unitPriceX, y, { align: 'right' });
      });

      const subTotal = services.reduce((sum, item) => sum + item.price, 0);
      const recargo = subTotal * 0.1;
      const total = subTotal + recargo;

      doc.moveDown(2);

      // Add totals
      const totalStartY = tableTop + 25 * services.length + 40;
      doc.text(`Sub Total: $${subTotal.toFixed(2)} ARS`, unitPriceX, totalStartY, { align: 'right' })
        .text(`Recargo por falta de pago a término: $${recargo.toFixed(2)} ARS`, unitPriceX, totalStartY + 15, { align: 'right' })
        .moveDown(1.5) // Add space between recargo and total
        .text(`Total: $${total.toFixed(2)} ARS`, unitPriceX, totalStartY + 45, { align: 'right', bold: true });

      // Add payment methods
      doc.moveDown(2);
      const paymentTableTop = doc.y;

      const paymentDescriptionX = 50;
      const paymentAmountX = 300;

      doc.fontSize(10)
        .fillColor('black')
        .text('Métodos de Pago:', paymentDescriptionX, paymentTableTop)
        .text('Banco Patagonia:', paymentDescriptionX, paymentTableTop + 15)
        .text('Alias: PAJARO.SABADO.LARGO', paymentDescriptionX, paymentTableTop + 30)
        .text('CBU: 0340040108409895361003', paymentDescriptionX, paymentTableTop + 45)
        .text('Cuenta: CA $ 040-409895361-000', paymentDescriptionX, paymentTableTop + 60)
        .text('CUIL: 20224964162', paymentDescriptionX, paymentTableTop + 75);

      doc.fontSize(10)
        .fillColor('black')
        .text('Mercado Pago:', paymentAmountX, paymentTableTop + 15)
        .text('Alias: lionseg.mp', paymentAmountX, paymentTableTop + 30)
        .text('CVU: 0000003100041927153583', paymentAmountX, paymentTableTop + 45)
        .text('Número: 1125071506 (Jorge Luis Castillo)', paymentAmountX, paymentTableTop + 60);

      doc.end();

      // Add invoice link to the client's invoiceLinks array
      const invoiceLink = `/facturas/${fileName}`;
      cliente.invoiceLinks.push(invoiceLink);
      await cliente.save();

      // Save the invoice link to the array
      enlacesFacturas.push(invoiceLink);

      // Enviar el PDF por correo electrónico al cliente
      const mailOptions = {
        from: 'federicojavier.suarez16@gmail.com',
        to: cliente.email,
        subject: 'Factura Generada',
        text: `Estimado ${cliente.name},\n\nSe ha generado una nueva factura para usted. Puede descargarla usando el siguiente enlace:\n\n${req.protocol}://${req.get('host')}${invoiceLink}\n\nSaludos,\nLionseg`,
        attachments: [
          {
            filename: fileName,
            path: `public/facturas/${fileName}`,
            contentType: 'application/pdf',
          },
        ],
      };

      await transporter.sendMail(mailOptions);
    }

    res.json({ message: 'Facturas generadas y correos electrónicos enviados', enlacesFacturas });
  } catch (error) {
    console.error('Error al generar facturas:', error);
    res.status(500).json({ error: 'Error al generar facturas' });
  }
});

// Crear una tarea cron para generar y enviar facturas automáticamente el primer día de cada mes a las 10:00 AM
cron.schedule('0 10 1 * *', async () => {
  try {
    await fetch('http://localhost:3000/api/generar-facturas', { method: 'POST' });
    console.log('Facturas generadas y correos electrónicos enviados automáticamente');
  } catch (error) {
    console.error('Error en la tarea cron de generación de facturas:', error);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
