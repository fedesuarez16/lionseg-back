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
  const { Storage } = require('@google-cloud/storage');

  
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

  const storage = new Storage({
    keyFilename: path.join(__dirname, GOOGLE_APPLICATION_CREDENTIALS), // Cambia la ruta
  });
  const bucketName = 'lionseg'; // Reem

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


 // Eliminar una factura por ID
app.delete('/api/clientes/:clienteId/invoiceLinks/:invoiceLinkId', async (req, res) => {
    const { clienteId, invoiceLinkId } = req.params;

    try {
        // Encuentra al cliente por ID
        const cliente = await Cliente.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        // Encuentra la factura en los invoiceLinks del cliente y la elimina
        const invoiceIndex = cliente.invoiceLinks.findIndex(link => link._id.toString() === invoiceLinkId);

        if (invoiceIndex === -1) {
            return res.status(404).json({ message: 'Factura no encontrada' });
        }

        cliente.invoiceLinks.splice(invoiceIndex, 1);

        // Guarda los cambios en la base de datos
        await cliente.save();

        res.status(200).json({ message: 'Factura eliminada exitosamente' });
    } catch (error) {
        console.error('Error al eliminar la factura:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
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

      const servicioPagado = cliente.services[0]?.producto || 'Servicio no especificado';
      const dominioPagado = cliente.services[0]?.domains[0] || 'Dominio no especificado';
      const shortInvoiceId = invoiceLink.id.slice(-3); // Obtiene los últimos 3 caracteres del ID

      
      emailSubject = 'Factura Pagada';
      emailHtml = `
     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd;">
    <div style="text-align: center;">
      <img src="https://storage.googleapis.com/lionseg/logolionseg.png" alt="Logo de tu empresa" style="width: 100px;">
    </div>
    <h2 style="text-align: center; color: #333;">Factura Pagada</h2>
    <p style="color: #666;">Estimado/a ${cliente.name},</p>
    <p style="color: #666;">Le informamos que su factura con número <strong>FAC-${shortInvoiceId}</strong> ha sido pagada.</p>
    <p style="color: #666;"><strong>Servicio:</strong> ${servicioPagado}</p>
    <p style="color: #666;"><strong>Domicilio:</strong> ${dominioPagado}</p>
    <p style="color: #666;"><strong>Total pagado:</strong> $${invoiceLink.total.toFixed(2)}</p>
    <p style="color: #666;">Gracias por su pago.</p>
    <p style="color: #666;">Saludos,<br/>Administracion Lionseg</p>
    <div style="border-top: 1px solid #ddd; margin-top: 20px; padding-top: 20px; text-align: center;">
      <p style="color: #666;">Sistema desarrollado por <a href="https://flipwebco.com" style="color: #1a73e8; text-decoration: none;">FlipWebCo</a></p>
    </div>
  </div>
`;
    } else if (state === 'overdue') {
      const shortInvoiceId = invoiceLink.id.slice(-3); // Obtiene los últimos 3 caracteres del ID

      emailSubject = 'Factura Vencida';
      emailHtml = `
       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd;">
    <div style="text-align: center;">
      <img src="https://storage.googleapis.com/lionseg/logolionseg.png" alt="Logo de tu empresa" style="width: 100px;">
    </div>
    <h2 style="text-align: center; color: #333;">Factura Vencida</h2>
    <p style="color: #666;">Estimado/a ${cliente.name},</p>
    <p style="color: #666;">Su factura con número <strong>FAC-${shortInvoiceId}</strong> ha vencido.</p>
    <p style="color: #666;">Por favor, realice el pago lo antes posible, de lo contrario su servicio se suspenderá dentro de las 72hs.</p>
    <p style="color: #666;"><strong>Total adeudado:</strong> $${invoiceLink.total.toFixed(2)}</p>
    <p style="color: #666;">Saludos,<br/>Administracion Lionseg</p>
    <div style="border-top: 1px solid #ddd; margin-top: 20px; padding-top: 20px; text-align: center;">
      <p style="color: #666;">Sistema desarrollado por <a href="https://flipwebco.com" style="color: #1a73e8; text-decoration: none;">FlipWebCo</a></p>
    </div>
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
  const localFilePath = path.join(__dirname, fileName); // Ruta temporal del archivo PDF

  console.log('Datos recibidos del frontend:', req.body);

  try {
    // Buscar al cliente
    const cliente = await Cliente.findById(clientId);
    if (!cliente) {
      console.error('Cliente no encontrado:', clientId);
      return res.status(404).send({ message: 'Cliente no encontrado' });
    }

    // Crear el documento PDF
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(localFilePath);
    doc.pipe(stream);

    // Agregar logo
    const logoPath = "./logo.png";
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 100 });
    }

    // Información de la factura
    const invoiceDate = new Date();
    const expirationDate = new Date(fechaVencimiento);
    const invoiceNumber = `INV-${Date.now()}`;

    doc.fontSize(10)
      .text(`Fecha de la Factura: ${invoiceDate.toLocaleDateString()}`, 200, 65, { align: 'right' })
      .text(`Fecha de Vencimiento: ${expirationDate.toLocaleDateString()}`, 200, 80, { align: 'right' })
      .text(`Número de Factura: ${invoiceNumber}`, 200, 95, { align: 'right' });

    doc.moveDown(2);

    doc.text(`Facturado a:`, 50, 160)
      .text(`${cliente.name}`, 50, 175)
      .text(`${cliente.email}`, 50, 190);

    doc.rect(45, 270, 510, 25).fill('#d3d3d3').stroke();
    doc.fillColor('black').fontSize(10)
      .text('Descripción', 55, 278)
      .text('Total', 460, 278, { align: 'right' });

    let y = 305;
    let total = monto || 0;

    doc.rect(45, y - 5, 510, 20).fill('#f9f9f9').stroke();
    doc.fillColor('black').fontSize(10)
      .text(descripcion || 'Servicio prestado', 55, y)
      .text(`$${parseFloat(total).toFixed(2)} ARS`, 460, y, { align: 'right' });

    doc.fontSize(12).fillColor('black').text(`Total: $${total.toFixed(2)} ARS`, 460, y + 20, { align: 'right' });

    doc.end();

    // Esperar a que el PDF se escriba completamente antes de subirlo
    await new Promise((resolve) => stream.on('finish', resolve));

    // Subir el PDF a Google Cloud Storage
    await storage.bucket(bucketName).upload(localFilePath, {
      destination: `facturas/${fileName}`,
      metadata: {
        contentType: 'application/pdf',
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/facturas/${fileName}`;

    // Crear una nueva factura
    const nuevaFactura = {
      fileName,
      url: publicUrl,
      registrationDate: invoiceDate,
      expirationDate: expirationDate,
      total: total,
    };

    cliente.invoiceLinks.push(nuevaFactura);
    await cliente.save();

    // Enviar correo con el enlace de descarga
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; height:auto; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd;">
        <h2 style="text-align: center;">Factura Generada</h2>
        <p>Estimado ${cliente.name},</p>
        <p>Se ha generado una nueva factura. Puedes descargarla en el siguiente enlace:</p>
        <p><a href="${publicUrl}" style="color: #1a73e8;">Descargar Factura</a></p>
        <p>Total a pagar: <strong>$${total.toFixed(2)} ARS</strong></p>
        <p>Por favor, realiza el pago antes del <strong>${expirationDate.toLocaleDateString()}</strong>.</p>
      </div>
    `;

    await transporter.sendMail({
      from: 'coflipweb@gmail.com',
      to: cliente.email,
      subject: 'Factura',
      html: htmlContent,
    });

    // Eliminar el archivo local después de subirlo a la nube
    fs.unlinkSync(localFilePath);

    res.status(201).send({ message: 'Factura creada exitosamente', factura: nuevaFactura });
  } catch (error) {
    console.error('Error al crear la factura:', error);
    res.status(500).send({ message: 'Error al crear la factura', error });
  }
});

