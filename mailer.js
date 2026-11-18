// const nodemailer = require('nodemailer');

// // Configure transporter with Outlook SMTP
// const transporter = nodemailer.createTransport({
//     // host: 'smtp.office365.com',
//     host: 'smtp-relay.brevo.com',
//     port: 587,
//     secure: false, // true for 465, false for other ports
//     auth: {
//     //     user: process.env.OUTLOOK_USER, // e.g., orders@yourdomain.com
//     //     pass: process.env.OUTLOOK_PASS  // Outlook app password or account password
//         user: process.env.OUTLOOK_USER, // e.g., orders@yourdomain.com
//         pass: process.env.OUTLOOK_PASS  // Outlook app password or account password
//     }
// });

// const sendOrderEmailToDistributor = async (distributorEmail, payload) => {
//     // Format the items list into a clean text or HTML table summary
//     const itemsListText = payload.items.map(item => 
//         `- ${item.product_name} (${item.variant}): ${item.qty} ${item.std_unit} | PTD: ₹${item.ptd} | Total: ₹${item.total_value}`
//     ).join('\n');

//     const mailOptions = {
//         from: `"Order Desk" <${process.env.OUTLOOK_USER}>`,
//         to: distributorEmail, // Distributor's email address
//         subject: `New Order Confirmation - ${payload.orderNo}`,
//         text: `Dear ${payload.distributor},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate} ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`
//     };

//     return await transporter.sendMail(mailOptions);
// };

// module.exports = { sendOrderEmailToDistributor };

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({

  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.OUTLOOK_USER,
    pass: process.env.OUTLOOK_PASS,
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 10000,
});

const sendOrderEmailToDistributor = async (distributorEmail, payload) => {
  const itemsListText = payload.items
    .map(
      (item) =>
        `- ${item.display_category} (${item.product_code}): ${item.qty} ${item.std_unit || ''} | PTD: ₹${item.ptd} | Taxable Value: ₹${item.taxable_value}`
    )
    .join('\n');

//   const mailOptions = {
//     from: `"Order Desk" <${process.env.MAIL_FROM}>`,
//     to: distributorEmail,
//     subject: `Order Placed from ${payload.distributorName} - ${payload.orderNo}`,
//     text: `Dear ${payload.distributor},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate},  ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`,
//   };
const itemsListHtml = itemsListText
  .split('\n')
  .map((line) => `<div>${line}</div>`)
  .join('');

const mailOptions = {
  from: `"Order Desk" <${process.env.MAIL_FROM}>`,
  to: distributorEmail,
  subject: `${payload.orderNo} : Order Placed from ${payload.distributorName}`,
  text: `Dear ${payload.distributorName},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate},  ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`,
  html: `
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
  `,
};



  const info = await transporter.sendMail(mailOptions);

  console.log('After sendMail -> info:', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    pending: info.pending,
    response: info.response,
  });
return info;
//   return transporter.sendMail(mailOptions);
};

module.exports = { sendOrderEmailToDistributor };