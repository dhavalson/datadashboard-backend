// const nodemailer = require('nodemailer');

// const transporter = nodemailer.createTransport({

//   host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
//   port: Number(process.env.SMTP_PORT) || 587,
//   secure: Number(process.env.SMTP_PORT) === 465,
//   auth: {
//     user: process.env.OUTLOOK_USER,
//     pass: process.env.OUTLOOK_PASS,
//   },
//   connectionTimeout: 8000,
//   greetingTimeout: 8000,
//   socketTimeout: 10000,
// });

// const sendOrderEmailToDistributor = async (distributorEmail, payload) => {
//     const apiKey = (process.env.BREVO_API_KEY || '').trim();
//   const senderAddress = (process.env.MAIL_FROM || '').trim();

//   if (!apiKey) {
//     throw new Error('Missing BREVO_API_KEY environment variable');
//   }
//   if (!senderAddress) {
//     throw new Error('Missing MAIL_FROM environment variable');
//   }

//   const itemsListText = payload.items
//     .map(
//       (item) =>
//         `- ${item.display_category} (${item.product_code}): ${item.qty} ${item.std_unit || ''} | PTD: ₹${item.ptd} | Taxable Value: ₹${item.taxable_value}`
//     )
//     .join('\n');

// const itemsListHtml = itemsListText
//   .split('\n')
//   .map((line) => `<div>${line}</div>`)
//   .join('');

// const mailOptions = {
//   from: `"Order Desk" <${process.env.MAIL_FROM}>`,
//   to: distributorEmail,
//   subject: `${payload.orderNo} : Order Placed from ${payload.distributorName}`,
//   text: `Dear ${payload.distributorName},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate},  ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`,
//   html: `
//     <p>Dear ${payload.distributorName},</p>
//     <p>Your primary order from <strong>${payload.distributorName}</strong> has been successfully placed.</p>
//     <p>
//       Order Number: ${payload.orderNo}<br/>
//       Date: ${payload.orderDate},  ${payload.orderTime}<br/>
//       Total Qty: ${payload.totalQty}<br/>
//       <strong>Taxable Amount: ₹${payload.taxableValue}</strong> <br/>
//       Total Amount: ₹${payload.totalAmount}
//     </p>
//     <p>Items Ordered:<br/>${itemsListHtml}</p>
//     <p>Thank you for your business!</p>
//   `,
// };



//   const info = await transporter.sendMail(mailOptions);

//   console.log('After sendMail -> info:', {
//     messageId: info.messageId,
//     accepted: info.accepted,
//     rejected: info.rejected,
//     pending: info.pending,
//     response: info.response,
//   });
// return info;
// //   return transporter.sendMail(mailOptions);
// };

// module.exports = { sendOrderEmailToDistributor };

const sendOrderEmailToDistributor = async (distributorEmail, payload) => {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderAddress = (process.env.MAIL_FROM || '').trim();

  if (!apiKey) {
    throw new Error('Missing BREVO_API_KEY environment variable');
  }
  if (!senderAddress) {
    throw new Error('Missing MAIL_FROM environment variable');
  }

  const itemsListText = (payload.items || [])
    .map(
      (item) =>
        `- ${item.display_category} (${item.product_code}): ${item.qty} ${item.std_unit || ''} | PTD: ₹${item.ptd} | Taxable Value: ₹${item.taxable_value}`
    )
    .join('\n');

  const itemsListHtml = itemsListText
    .split('\n')
    .map((line) => `<div>${line}</div>`)
    .join('');

  const textContent = `Dear ${payload.distributorName},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate},  ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`;

  const htmlContent = `
    <p>Dear ${payload.distributorName},</p>
    <p>Your primary order from <strong>${payload.distributorName}</strong> has been successfully placed.</p>
    <p>
      Order Number: ${payload.orderNo}<br/>
      Date: ${payload.orderDate},  ${payload.orderTime}<br/>
      Total Qty: ${payload.totalQty}<br/>
      <strong>Taxable Amount: ₹${payload.taxableValue}</strong> <br/>
      Total Amount: ₹${payload.totalAmount}
    </p>
    <p>Items Ordered:<br/>${itemsListHtml}</p>
    <p>Thank you for your business!</p>
  `;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: 'Order Desk',
        email: senderAddress,
      },
      to: [{ email: distributorEmail }],
      subject: `${payload.orderNo} : Order Placed from ${payload.distributorName}`,
      textContent,
      htmlContent,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Brevo API error (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('After sendMail (Brevo API) -> data:', data);
  return data;
};

module.exports = { sendOrderEmailToDistributor };