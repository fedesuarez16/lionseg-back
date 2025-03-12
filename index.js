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

const logoPath = "./logo.png";
if (fs.existsSync(logoPath)) {
  doc.image(logoPath, 50, 45, { width: 100 });
}

const invoiceDate = new Date();
const expirationDate = new Date(fechaVencimiento);
const invoiceNumber = `INV-${Date.now()}`;

doc.fontSize(10)
  .text(`Fecha de la Factura: ${invoiceDate.toLocaleDateString()}`, 200, 65, { align: 'right' })
  .text(`Fecha de Vencimiento: ${expirationDate.toLocaleDateString()}`, 200, 80, { align: 'right' })
  .text(`Número de Factura: ${invoiceNumber}`, 200, 95, { align: 'right' });

doc.moveDown(2);

const clientAddress = cliente.services.length > 0 && cliente.services[0].domains.length > 0
  ? cliente.services[0].domains.join(', ')
  : 'Dirección no proporcionada';

doc.text(`Facturado a:`, 50, 160)
  .text(`${cliente.name}`, 50, 175)
  .text(`${clientAddress}`, 50, 190)
  .text(`${cliente.city || ''}, ${cliente.state || ''}, ${cliente.zip || ''}`, 50, 205)
  .text(`${cliente.country || 'Argentina'}`, 50, 220);

doc.moveDown(2);

doc.rect(45, 270, 510, 25).fill('#d3d3d3').stroke(); // Encabezado con sombra

doc.fillColor('black').fontSize(10)
  .text('Descripción', 55, 278, { bold: true })
  .text('Total', 460, 278, { align: 'right', bold: true });

let y = 305;
let total = 0;

cliente.services.forEach((servicio, index) => {
  const servicioDescripcion = servicio.producto || 'Servicio sin descripción';
  const servicioPrecio = servicio.price || 0;

  doc.rect(45, y - 5, 510, 20).fill(index % 2 === 0 ? '#f9f9f9' : '#ffffff').stroke();
  doc.fillColor('black').fontSize(10);

  doc.text(servicioDescripcion, 55, y)
     .text(`$${parseFloat(servicioPrecio).toFixed(2)} ARS`, 460, y, { align: 'right' });

  total += parseFloat(servicioPrecio);
  y += 25;
});

doc.fontSize(12).fillColor('black').text(`Total: $${total.toFixed(2)} ARS`, 460, y + 20, { align: 'right', bold: true });

doc.moveDown(2);
doc.fontSize(10)
  .fillColor('black')
  .text('Métodos de Pago:', 50, y + 50)
  .text('Banco Patagonia:', 50, y + 65)
  .text('Alias: PAJARO.SABADO.LARGO', 50, y + 80)
  .text('CBU: 0340040108409895361003', 50, y + 95)
  .text('Cuenta: CA $ 040-409895361-000', 50, y + 110)
  .text('CUIL: 20224964162', 50, y + 125);

doc.text('Mercado Pago:', 300, y + 65)
  .text('Alias: lionseg.mp', 300, y + 80)
  .text('CVU: 0000003100041927153583', 300, y + 95)
  .text('Número: 1125071506 (Jorge Luis Castillo)', 300, y + 110);

doc.text('O escanea el QR y paga', 60, y + 160);

const qrPath = "./qr.png";
if (fs.existsSync(qrPath)) {
  doc.image(qrPath, 220, y + 180, { width: 200 });
}

doc.text('Luego de transferir a la cuenta de tu preferencia debes enviar el comprobante al número de administracion de Lionseg +54 9 11 3507-2413', 150, y + 400);

doc.end();

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; height:auto; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd;">
      <div style="text-align: center;">
        <img src="https://storage.googleapis.com/lionseg/logolionseg.png" alt="Logo" style="width: 100px;">
      </div>
      <h2 style="text-align: center; color: #333;">Factura Generada</h2>
      <p style="color: #666;">Estimado ${cliente.name},</p>
      <p style="color: #666;">Te informamos que se ha generado una nueva factura. Puedes descargarla desde el enlace adjunto:</p>
      <p style="color: #666;">Total a pagar: <strong>$${total.toFixed(2)} ARS</strong></p>
      <p style="color: #666;">Métodos de pago:</p>
      <ul style="color: #666;">
        <li>Transferencia Bancaria: CBU 0340040108409895361003</li>
        <li>MercadoPago: Alias lionseg.mp</li>
        <li>Efectivo</li>
      </ul>
      <p style="color: #666;">Por favor, realiza el pago antes del <strong>${expirationDate.toLocaleDateString()}</strong> para evitar recargos .</p>
        <p style="color: #666;">Enviar comprobante de pago al siguiente numero +54 9 11 3507-2413. El pago no sera procesado hasta recibir el comprobante</p>

      <div style="text-align: center; margin-top: 20px;">
        <img src="https://storage.googleapis.com/lionseg/QR_43096512.pdf.png" alt="QR Code" style="width: 150px;">
      </div>
      <p style="color: #666;">Gracias por confiar en nuestros servicios.</p>
      <div style="border-top: 1px solid #ddd; margin-top: 20px; padding-top: 20px; text-align: center;">
        <p style="color: #666;">Sistema desarrollado por <a href="https://www.flipwebco.com" style="color: #1a73e8; text-decoration: none;">Flipwebco</a></p>
      </div>
    </div>
  `;

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
      html:htmlContent,
      attachments: [{ filename: fileName, path: `./public/facturas/${fileName}` }],
    });

    res.status(201).send({ message: 'Factura creada exitosamente', factura: nuevaFactura });
  } catch (error) {
    console.error('Error al crear la factura:', error);
    res.status(500).send({ message: 'Error al crear la facturas', error });
  }
});

