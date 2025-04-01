# Atlas Account Vault

A secure web application for managing and storing account credentials with features like file attachments and favicon display.

## Features

- 🔐 Secure account credential storage
- 👤 User authentication and authorization
- 📎 File attachment support
- 🖼️ Automatic favicon fetching for websites
- 🎨 Beautiful and responsive UI
- 📱 Mobile-friendly design
- 🔍 Search and filter capabilities
- 🔄 Real-time database status monitoring

## Project Structure

```plaintext
Atlas-Account-Vault-01.04.25/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── script.js
│   │   └── script.backup.js
│   └── index.html
├── models/
│   └── Account.js
├── routes/
│   ├── accounts.js
│   └── auth.js
├── middleware/
│   ├── auth.js
│   └── upload.js
├── config/
│   └── database.js
├── node_modules/
├── .env
├── .gitignore
├── package.json
└── README.md
```

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MongoDB with GridFS for file storage
- Authentication: JWT (JSON Web Tokens)
- Icons: DuckDuckGo Favicon Service

## Installation

1. Clone the repository:

```bash
git clone https://github.com/jayakumar9/Atlas-Account-Vault-01.04.25.git
cd Atlas-Account-Vault-01.04.25
```

2.Install dependencies:

```bash
npm install
```

3.Set up environment variables:
Create a `.env` file in the root directory with:

```properties
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=3000
```

4.Start the application:

```bash
npm start
```

## Usage

1. Register a new account or login with existing credentials
2. Add new accounts with website, username, and password
3. Optionally attach files to account entries
4. View, edit, or delete stored accounts
5. Monitor system status through the status indicator

## Security Features

- Password encryption
- JWT-based authentication
- Secure file storage with GridFS
- Session management
- Input validation and sanitization

## Development

To run in development mode:

```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- DuckDuckGo for favicon service
- MongoDB Atlas for database hosting
- Express.js community for the excellent framework

## Latest Updates

- Added favicon support for websites
- Improved error handling
- Enhanced UI/UX with responsive design
- Added file attachment capabilities
- Implemented real-time database status monitoring

## Contact

Jayakumar - [@jayakumar9](https://github.com/jayakumar9)

Project Link: [https://github.com/jayakumar9/Atlas-Account-Vault-01.04.25](https://github.com/jayakumar9/Atlas-Account-Vault-01.04.25)
