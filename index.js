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
  origin: ['https://lionseg-erp.vercel.app', 'http://localhost:3000'], // Añade todos los orígenes permitidos aquí
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Encabezados permitidos
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
        const logoPath = 'C:\\Users\\fedes\\clients-panel\\server\\logo.png'; // Replace with the path to your logo
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
        const services = cliente.services.length > 0 ? cliente.services : [];
        
        // Add table headers with dark gray color
        const tableTop = 280;
        const itemCodeX = 50;
        const descriptionX = 50;
        const unitPriceX = 450;

        doc.rect(itemCodeX, tableTop - 5, unitPriceX - itemCodeX + 100, 20)
          .fill('#696969')
          .stroke();

        doc.fontSize(10).fillColor('white')
          .text('Descripción', descriptionX, tableTop, { bold: true })
          .text('Total', unitPriceX, tableTop, { align: 'right', bold: true });

        // Add table rows with alternating gray colors
        services.forEach((item, index) => {
          const y = tableTop + 25 + (index * 25);
          const fillColor = index % 2 === 0 ? '#cccccc' : '#e6e6e6';

          doc.rect(itemCodeX, y - 5, unitPriceX - itemCodeX + 100, 25)
            .fill(fillColor)
            .stroke();

          doc.fillColor('black')
            .text(item.producto || 'N/A', descriptionX, y)
            .text(`$${(item.price || 0).toFixed(2)} ARS`, unitPriceX, y, { align: 'right' });
        });

        const subTotal = services.reduce((sum, item) => sum + (item.price || 0), 0);
        let recargo = 0;
        if (new Date() > expirationDate) {
          recargo = subTotal * 0.1;
        }
        const total = subTotal + recargo;

        // Add totals with added space
        const totalStartY = tableTop + 25 * services.length + 40;
        doc.text(`Sub Total: $${subTotal.toFixed(2)} ARS`, unitPriceX, totalStartY, { align: 'right' })
          .text(`Recargo por falta de pago a término: $${recargo.toFixed(2)} ARS`, unitPriceX, totalStartY + 15, { align: 'right' })
          .moveDown(8) // Increased space between recargo and total
          .text(`Total: $${total.toFixed(2)} ARS`, unitPriceX, totalStartY + 60, { align: 'right', bold: true });

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

        const invoice = {
          fileName,
          state: 'pending',
          registrationDate: invoiceDate,
          expirationDate,
          invoiceNumber,
          total,
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

    // Check if the invoice is being marked as 'pagada'
    if (state === 'pagada' && invoiceLink.state !== 'pagada') {
      cliente.totalIngresos += invoiceLink.total;
    }

    invoiceLink.state = state;
    await cliente.save();

    res.status(200).json(invoiceLink);
  } catch (error) {
    res.status(500).json({ error: 'Could not update invoice link state' });
  }
});


