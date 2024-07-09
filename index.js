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
    const clientes = await Cliente.find({ state: 'activo' });

    const enlacesFacturas = [];

    for (const cliente of clientes) {
      try {
        const doc = new PDFDocument({ margin: 40 });
        const fileName = `factura_${cliente._id}_${Date.now()}.pdf`;

        const dirFacturas = 'public/facturas';
        if (!fs.existsSync(dirFacturas)) {
          fs.mkdirSync(dirFacturas, { recursive: true });
        }

        const filePath = path.join(dirFacturas, fileName);
        doc.pipe(fs.createWriteStream(filePath));

        // Add logo
        const logoPath = path.join(__dirname, 'logo.png'); // Replace with the path to your logo
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 45, { width: 150 });
        }

        // Get the current date and calculate the expiration date
        const invoiceDate = new Date();
        const expirationDate = new Date();
        expirationDate.setDate(invoiceDate.getDate() + 7); // 7 days from the invoice date

        const service = cliente.services.length > 0 ? cliente.services[0] : {};

        const invoiceNumber = `INV-${Date.now()}`;

        // Header
        doc.fontSize(20).text('FACTURA', { align: 'center' });
        doc.moveDown(2);

        // Invoice metadata
        doc.fontSize(12).text(`Factura nº ${invoiceNumber}`, { align: 'right' });
        doc.text(`Fecha de la Factura: ${invoiceDate.toLocaleDateString()}`, { align: 'right' });
        doc.text(`Fecha de Vencimiento: ${expirationDate.toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(1);

        // Client details
        doc.fontSize(12).text(`Facturado a: ${cliente.name}`, { align: 'left' });
        doc.text(`Email: ${cliente.email}`, { align: 'left' });
        doc.text(`Teléfono: ${cliente.phoneNumber}`, { align: 'left' });
        doc.moveDown(1);

        // Service details
        doc.fontSize(12).text('Descripción', 50, doc.y);
        doc.text('Total', 400, doc.y);
        doc.moveDown(0.5);

        doc.fontSize(12).text(service.producto || 'Servicio no especificado', 50, doc.y);
        doc.text(`$${service.price.toFixed(2) || '0.00'} ARS`, 400, doc.y);
        doc.moveDown(1);

        // Subtotal, credit, and total
        doc.fontSize(12).text(`Sub Total`, 50, doc.y);
        doc.text(`$${service.price.toFixed(2) || '0.00'} ARS`, 400, doc.y);
        doc.moveDown(0.5);

        doc.text('Crédito', 50, doc.y);
        doc.text('$0.00 ARS', 400, doc.y);
        doc.moveDown(0.5);

        doc.text('Total', 50, doc.y);
        doc.text(`$${service.price.toFixed(2) || '0.00'} ARS`, 400, doc.y);
        doc.moveDown(2);

        // Payment methods
        doc.fontSize(12).text('Métodos de Pago:', { underline: true });
        doc.moveDown(0.5);

        // Banco Patagonia details
        doc.text('Banco Patagonia:', 50, doc.y);
        doc.text('Alias: PAJARO.SABADO.LARGO', 70, doc.y + 15);
        doc.text('CBU: 0340040108409895361003', 70, doc.y + 30);
        doc.text('Cuenta: CA $  040-409895361-000', 70, doc.y + 45);
        doc.text('CUIL: 20224964162', 70, doc.y + 60);
        doc.moveDown(2);

        // Mercado Pago details
        doc.text('Mercado Pago:', 50, doc.y);
        doc.text('Alias: lionseg.mp', 70, doc.y + 15);
        doc.text('CVU: 0000003100041927153583', 70, doc.y + 30);
        doc.text('Número: 1125071506 (Jorge Luis Castillo)', 70, doc.y + 45);
        doc.moveDown(2);

        // Footer
        doc.fontSize(10).text('PDF Generado el ' + new Date().toLocaleDateString(), { align: 'right' });
        doc.text('Powered by TCPDF (www.tcpdf.org)', { align: 'right' });

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

        const facturaLink = `https://localhost:3000/facturas/${fileName}`; // Cambiar a HTTPS si es necesario
        enlacesFacturas.push(facturaLink);

        await transporter.sendMail({
          from: 'coflipweb@gmail.com',
          to: cliente.email,
          subject: 'Factura',
          text: 'Se adjunta la factura.',
          attachments: [{ filename: fileName, path: filePath }],
        });

      } catch (error) {
        console.error(`Error al generar la factura para el cliente ${cliente.name}:`, error);
      }
    }

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
