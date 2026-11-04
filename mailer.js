const nodemailer = require('nodemailer');

// Configure transporter with Outlook SMTP
const transporter = nodemailer.createTransport({
    // host: 'smtp.office365.com',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
    //     user: process.env.OUTLOOK_USER, // e.g., orders@yourdomain.com
    //     pass: process.env.OUTLOOK_PASS  // Outlook app password or account password
        user: process.env.OUTLOOK_USER, // e.g., orders@yourdomain.com
        pass: process.env.OUTLOOK_PASS  // Outlook app password or account password
    }
});

const sendOrderEmailToDistributor = async (distributorEmail, payload) => {
    // Format the items list into a clean text or HTML table summary
    const itemsListText = payload.items.map(item => 
        `- ${item.product_name} (${item.variant}): ${item.qty} ${item.std_unit} | PTD: ₹${item.ptd} | Total: ₹${item.total_value}`
    ).join('\n');

    const mailOptions = {
        from: `"Order Desk" <${process.env.OUTLOOK_USER}>`,
        to: distributorEmail, // Distributor's email address
        subject: `New Order Confirmation - ${payload.orderNo}`,
        text: `Dear ${payload.distributor},\n\nYour primary order has been successfully placed.\n\nOrder Number: ${payload.orderNo}\nDate: ${payload.orderDate} ${payload.orderTime}\nTotal Qty: ${payload.totalQty}\nTotal Amount: ₹${payload.totalAmount}\n\nItems Ordered:\n${itemsListText}\n\nThank you for your business!`
    };

    return await transporter.sendMail(mailOptions);
};

module.exports = { sendOrderEmailToDistributor };