  const express = require('express');
  const mongoose = require('mongoose');
  const bodyParser = require('body-parser');
  const Cliente = require('./models/cliente'); // Import the Cliente model
  const cors = require('cors');
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const cron = require('node-cron'); // Importa node-cron
  const Ingreso = require('./models/Ingreso'); // Asegúrate de importar el modelo de Ingreso
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

 

  
// Generate invoices for all active clients
app.post('/api/generar-facturas', async (req, res) => {
  try {
    // Filtrar solo clientes activos
    const clientes = await Cliente.find({ state: 'activo' });

    const enlacesFacturas = [];

    for (const cliente of clientes) {
      const doc = new PDFDocument();
      const fileName = `FAC_${Date.now()}.pdf`;

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
        .text(`Recargo por falta de pago a término: $${recargo.toFixed(2)} ARS`, unitPriceX, totalStartY + 35, { align: 'right' })
        .moveDown(8) // Increased space between recargo and total
        .text(`Total: $${total.toFixed(2)} ARS`, unitPriceX, totalStartY + 80, { align: 'right', bold: true });

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

      // Add custom message at the bottom
      const customMessageY = doc.y + 20;
      doc.text('Puedes transferir a la cuenta de tu preferencia y debes enviar el comprobante al siguiente número', 50, customMessageY);

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

    let emailSubject = '';
    let emailHtml = '';

    if (invoiceLink.state !== 'paid' && state === 'paid') {
      console.log(`Updating total ingresos: ${cliente.totalIngresos} + ${invoiceLink.total}`);
      cliente.totalIngresos += invoiceLink.total;

      const newIngreso = new Ingreso({ amount: invoiceLink.total });
      await newIngreso.save();

      emailSubject = 'Factura Pagada';
      emailHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
          <img src="https://lionseg.s3.us-east-2.amazonaws.com/logolionseg.png?response-content-disposition=inline&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEEIaCXVzLWVhc3QtMiJHMEUCIQDHnBe3Pp1gLD5ht1XtJbaOLNj0U6kxBH6YWWS5K%2FspegIgflvLxQacgyXFWB0lQL9j5s6G6bKCe%2B00cV7Hvy95090q5AIIOxAAGgw5MDU0MTg0NjQxMDYiDCxqoAA5JUkCcCZWwCrBAhJlHfhpNDIbhB3muMus8afejvWT7x4K%2FaBL8GL2djwbRXaF21rQV7MpuMWRE%2BnXh7ZVEKbhkRWEZUbqKDpMmWl8ylSEs7c5W6onDXcG3wGEgbomXyvct3q%2BBMBER8kGtZNV%2FNgFhh0W3dQ%2FrMlUNwiJYFGFFKi2Kpo0gG2WKaf9sRLu2FZhRSSZWcIWEwTtnBKqBRIn3YUeX6RBZ78%2F467GkMM4q7vrBjmfzeUfFb4KCYFsaYo9kMUj4lmJuwwtdn9eXiw1MxHV8tR3JnFFgx%2F6MEUpFbltBSu6XMmt08Zmp11Nb95bNH9V%2FuiszGKeMHie0NAGM6WJtHHckTJvPeeBpEJ%2FWFnAY5MJ5x8hOke7ilX6otb1kPukrcsTprIjtY32DFxtbwF%2FuDhKzC9oQFgvgZSeCEHk%2F5PPhx61TfAzpzDe5dW1BjqzAmlIebNXUR2wFfjO6mTsp7d0qiHbeQNU578moRaf4iodsv69vITaLYrkoTdnqETstc6rGuSHxsc3M3VyekuThQwtEq8AgqNy%2BkPdIPMoWkNPj5wxErUu94pkc9%2FcFM2bMmYECEsLDitfOLzxSBf1Ssz%2FwJJRes49jjEqK9oM%2BV1g%2B%2FKyfMJSw8E6PaaRXV0YPUoOYLenzQLl1uJdplBjXoZmE4AhxGqYeGe0Cbf3fI6vKuJFdGgnwyodmPXJjsFHmk8s2DgZ57d6nHNOBkb6zxE816Cz%2BOXk9QUNm8IYenVs9dS52ye9bRpFQh4Z8ipbtceXsFpbBW8%2FckjIKY2n1b1ajGVtVrGO5kn5DQ61MzVQORXbI7t6itTbfz14qgMBXV%2FEV6r9CJ3kIHAubtQF21MHLM8%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20240809T014403Z&X-Amz-SignedHeaders=host&X-Amz-Expires=300&X-Amz-Credential=ASIA5FTZFLNVFOR6AUNI%2F20240809%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Signature=5bc3186f017efdc3e8718fa45b541bda3a10ba3a27f299967497a091814e2a4a" alt="Logo de tu empresa" style="width: 150px;"/>
          <h2>Estimado/a ${cliente.name},</h2>
          <p>Su factura con número <strong>${invoiceLink.invoiceNumber}</strong> ha sido pagada. Gracias por su pago.</p>
          <p>Saludos,<br/>Su empresa</p>
        </div>
      `;
    } else if (state === 'overdue') {
      emailSubject = 'Factura Vencida';
      emailHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
          <img src="https://lionseg.s3.us-east-2.amazonaws.com/logolionseg.png?response-content-disposition=inline&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEEIaCXVzLWVhc3QtMiJHMEUCIQDHnBe3Pp1gLD5ht1XtJbaOLNj0U6kxBH6YWWS5K%2FspegIgflvLxQacgyXFWB0lQL9j5s6G6bKCe%2B00cV7Hvy95090q5AIIOxAAGgw5MDU0MTg0NjQxMDYiDCxqoAA5JUkCcCZWwCrBAhJlHfhpNDIbhB3muMus8afejvWT7x4K%2FaBL8GL2djwbRXaF21rQV7MpuMWRE%2BnXh7ZVEKbhkRWEZUbqKDpMmWl8ylSEs7c5W6onDXcG3wGEgbomXyvct3q%2BBMBER8kGtZNV%2FNgFhh0W3dQ%2FrMlUNwiJYFGFFKi2Kpo0gG2WKaf9sRLu2FZhRSSZWcIWEwTtnBKqBRIn3YUeX6RBZ78%2F467GkMM4q7vrBjmfzeUfFb4KCYFsaYo9kMUj4lmJuwwtdn9eXiw1MxHV8tR3JnFFgx%2F6MEUpFbltBSu6XMmt08Zmp11Nb95bNH9V%2FuiszGKeMHie0NAGM6WJtHHckTJvPeeBpEJ%2FWFnAY5MJ5x8hOke7ilX6otb1kPukrcsTprIjtY32DFxtbwF%2FuDhKzC9oQFgvgZSeCEHk%2F5PPhx61TfAzpzDe5dW1BjqzAmlIebNXUR2wFfjO6mTsp7d0qiHbeQNU578moRaf4iodsv69vITaLYrkoTdnqETstc6rGuSHxsc3M3VyekuThQwtEq8AgqNy%2BkPdIPMoWkNPj5wxErUu94pkc9%2FcFM2bMmYECEsLDitfOLzxSBf1Ssz%2FwJJRes49jjEqK9oM%2BV1g%2B%2FKyfMJSw8E6PaaRXV0YPUoOYLenzQLl1uJdplBjXoZmE4AhxGqYeGe0Cbf3fI6vKuJFdGgnwyodmPXJjsFHmk8s2DgZ57d6nHNOBkb6zxE816Cz%2BOXk9QUNm8IYenVs9dS52ye9bRpFQh4Z8ipbtceXsFpbBW8%2FckjIKY2n1b1ajGVtVrGO5kn5DQ61MzVQORXbI7t6itTbfz14qgMBXV%2FEV6r9CJ3kIHAubtQF21MHLM8%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20240809T014403Z&X-Amz-SignedHeaders=host&X-Amz-Expires=300&X-Amz-Credential=ASIA5FTZFLNVFOR6AUNI%2F20240809%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Signature=5bc3186f017efdc3e8718fa45b541bda3a10ba3a27f299967497a091814e2a4a" alt="Logo de tu empresa" style="width: 150px;"/>
          <h2>Estimado/a ${cliente.name},</h2>
          <p>Su factura con número <strong>${invoiceLink.invoiceNumber}</strong> ha vencido. Por favor, realice el pago lo antes posible.</p>
          <p>Saludos,<br/>Su empresa</p>
        </div>
      `;
    }

    if (emailSubject && emailHtml) {
      await transporter.sendMail({
        from: 'coflipweb@gmail.com',
        to: cliente.email,
        subject: emailSubject,
        html: emailHtml,
      });
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
  
      if (invoiceLink.state !== 'paid' && state === 'paid') {
        console.log(`Updating total ingresos: ${cliente.totalIngresos} + ${invoiceLink.total}`);
        cliente.totalIngresos += invoiceLink.total;
  
        const newIngreso = new Ingreso({ amount: invoiceLink.total });
        await newIngreso.save();
  
        // Enviar correo al cliente
        const mailOptions = {
          from: 'your-email@gmail.com',
          to: cliente.email,
          subject: 'Factura Pagada',
          text: `Estimado/a ${cliente.name},\n\nSu factura con número ${invoiceLink.invoiceNumber} ha sido pagada. Gracias por su pago.\n\nSaludos,\nSu empresa`,
        };
  
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log('Error al enviar el correo:', error);
          } else {
            console.log('Correo enviado: ' + info.response);
          }
        });
      }
  
      invoiceLink.state = state;
      await cliente.save();
  
      res.status(200).json(invoiceLink);
    } catch (error) {
      res.status(500).json({ error: 'Could not update invoice link state' });
    }
  });
  


  // Ruta para obtener el total de ingresos
app.get('/api/total-ingresos', async (req, res) => {
  try {
    const clientes = await Cliente.find({});
    const totalIngresos = clientes.reduce((total, cliente) => total + cliente.totalIngresos, 0);
    res.status(200).json({ totalIngresos });
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve total ingresos' });
  }
});


app.get('/api/ingresos', async (req, res) => {
  try {
    const ingresos = await Ingreso.find({});
    res.status(200).json(ingresos);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve ingresos' });
  }
});

// Ruta para eliminar todos los ingresos
app.delete('/api/ingresos', async (req, res) => {
  try {
    await Ingreso.deleteMany({});
    res.status(200).json({ message: 'Historial de ingresos eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo eliminar el historial de ingresos' });
  }
});


app.post('/api/clientes/:clientId/invoices', async (req, res) => {
  const { clientId } = req.params;
  const { monto, fechaVencimiento, descripcion } = req.body;

  const fileName = `IND_${Date.now()}.pdf`;

  console.log('Datos recibidos del frontend:', req.body); // Verificar que los datos se reciban correctamente

  try {
    // Buscar al cliente por su ID
    const cliente = await Cliente.findById(clientId);
    if (!cliente) {
      console.error('Cliente no encontrado:', clientId);
      return res.status(404).send({ message: 'Cliente no encontrado' });
    }

    const doc = new PDFDocument();
    const dirFacturas = 'public/facturas';
    if (!fs.existsSync(dirFacturas)) {
      const dirPublic = 'public';
      if (!fs.existsSync(dirPublic)) {
        fs.mkdirSync(dirPublic);
      }
      fs.mkdirSync(dirFacturas);
    }

    doc.pipe(fs.createWriteStream(`public/facturas/${fileName}`));

    // Add invoice title
    doc.fontSize(20).text('Factura', 110, 57);

    // Add invoice metadata
    const invoiceDate = new Date();
    const expirationDate = new Date(fechaVencimiento);
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
    // Background for the header
    doc.rect(50, 275, 500, 20).fill('#d3d3d3'); // Light grey background for header
    doc.fillColor('black').fontSize(10)
      .text('Descripción', 50, 280, { bold: true })
      .text('Total', 450, 280, { align: 'right', bold: true });

    const y = 305;
    // Background for the row
    doc.rect(50, y - 5, 500, 20).fill('#f0f0f0'); // Lighter grey background for row
    doc.fillColor('black').fontSize(10)
      .text(descripcion, 50, y)
      .text(`$${parseFloat(monto).toFixed(2)} ARS`, 450, y, { align: 'right' });

    const total = parseFloat(monto);

    // Add totals
    doc.text(`Total: $${total.toFixed(2)} ARS`, 450, y + 50, { align: 'right', bold: true });

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

    // Add custom message at the bottom
    const customMessageY = doc.y + 20;
    doc.text('Puedes transferir a la cuenta de tu preferencia y debes enviar el comprobante al siguiente número', 50, customMessageY);

    doc.end();

    // Crear una nueva factura
    const nuevaFactura = {
      fileName,
      registrationDate: invoiceDate,
      expirationDate: expirationDate,
      total: total,
    };

    console.log('Nueva factura creada:', nuevaFactura); // Verificar los datos de la nueva factura

    // Añadir la factura al cliente
    cliente.invoiceLinks.push(nuevaFactura);

    // Guardar los cambios en la base de datos
    await cliente.save();

    console.log('Cliente actualizado:', cliente); // Verificar que el cliente se actualizó correctamente

    // Enviar correo electrónico con la factura
    await transporter.sendMail({
      from: 'coflipweb@gmail.com',
      to: cliente.email,
      subject: 'Factura',
      text: 'Se adjunta la factura.',
      attachments: [{ filename: fileName, path: `./public/facturas/${fileName}` }],
    });

    res.status(201).send({ message: 'Factura creada exitosamente', factura: nuevaFactura });
  } catch (error) {
    console.error('Error al crear la factura:', error);
    res.status(500).send({ message: 'Error al crear la factura', error });
  }
});

