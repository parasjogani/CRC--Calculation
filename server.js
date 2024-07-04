// Require dotenv and configure to load environment variables from .env file
require('dotenv').config();

// Require necessary modules
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Create an Express app
const app = express();
const port = process.env.PORT;

// MongoDB connection URI and database name
const uri = process.env.MONGODB_URL;

// Define mongoose schema and model
const Schema = mongoose.Schema;
const uidSchema = new Schema({
    uid: { type: String, required: true, unique: true }
});
const UID = mongoose.model('UID', uidSchema);

// Connect to MongoDB using mongoose
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(error => {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1); // Exit the application if failed to connect
    });

// Function to generate a random 8-digit alphanumeric UID without lowercase characters
function generateRandomUID() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let uid = '';
    for (let i = 0; i < 8; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// Function to convert string to HEX
function stringToHex(str) {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
        hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
}

// Function to insert the UID HEX value into the 148-byte HEX string at the specified positions
function insertUIDIntoHex(hexString, uidHex) {
    const start = 26 * 2; // Byte 27 (0-based index)
    const end = 34 * 2;   // Byte 34 (0-based index)
    return hexString.substring(0, start) + uidHex + hexString.substring(end);
}

// CRC16ModbusMaster definition
const CRC16ModbusMaster = {
    StringToCheck: "",
    CleanedString: "",

    // Clean string assuming input is HEX
    CleanString: function () {
        if (/^[0-9A-F \t]+$/i.test(this.StringToCheck)) {
            this.CleanedString = this._hexStringToString(this.StringToCheck.replace(/[\t ]/g, ''));
        } else {
            console.log("String doesn't seem to be a valid Hex input.");
            return false;
        }
        return true;
    },

    // Calculate CRC16Modbus
    CRC16Modbus: function () {
        let crc = 0xFFFF;
        const str = this.CleanedString;
        for (let pos = 0; pos < str.length; pos++) {
            crc ^= str.charCodeAt(pos);
            for (let i = 8; i !== 0; i--) {
                if ((crc & 0x0001) !== 0) {
                    crc = (crc >> 1) ^ 0xA001;
                } else {
                    crc >>= 1;
                }
            }
        }
        return crc;
    },

    // Utility function to convert hex string to normal string
    _hexStringToString: function (inputstr) {
        const hex = inputstr.toString();
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        return str;
    },

    // Calculate the CRC for the given string
    Calculate: function (str) {
        this.StringToCheck = str;
        if (this.CleanString()) {
            return this.CRC16Modbus();
        }
        return null;
    }
};

// Generate CSV data
async function generateCSVData() {
    const fixedPart = "1002200181080000000000000000000000000000000000000000566972414c3132330000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    const hexString = fixedPart.padEnd(296, '0');
    let csvContent = "";

    const batchSize = 1000;

    // Fetch all existing UIDs from the database
    const existingUIDs = new Set((await UID.find({}, 'uid')).map(doc => doc.uid));

    for (let batchIndex = 0; batchIndex < 30; batchIndex++) {
        const uidsForCSV = [];

        // Generate UIDs for the current batch
        for (let i = 0; i < batchSize; i++) {
            let uidForCSV;

            // Ensure the UID for CSV is unique
            do {
                uidForCSV = generateRandomUID();
            } while (existingUIDs.has(uidForCSV));

            // Add the new UIDs to the set
            existingUIDs.add(uidForCSV);

            const uidHex = stringToHex(uidForCRC);
            const updatedHexString = insertUIDIntoHex(hexString, uidHex);
            const crcValue = CRC16ModbusMaster.Calculate(updatedHexString);
            const crcHex = crcValue.toString(16).toUpperCase().padStart(4, '0');
            const finalUIDHex = uidHex + crcHex;
            csvContent += `${uidForCSV};${finalUIDHex}\n`;

            uidsForCSV.push({ uid: uidForCSV });
        }

        try {
            // Insert generated UIDs in bulk for the current batch
            await UID.insertMany([...uidsForCSV]);
        } catch (error) {
            console.error('Error inserting UIDs:', error);
            throw error;
        }
    }

    return csvContent;
}



// Serve the CSV file route
app.get('/download', async (req, res) => {
    try {
        const csvData = await generateCSVData();
        const filePath = path.join(__dirname, 'uid_crc_data.csv');
        fs.writeFileSync(filePath, csvData);

        res.download(filePath, 'uid_crc_data.csv', (err) => {
            if (err) {
                console.error("Error during file download:", err);
            }
            // Delete the CSV file after download
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error("Error deleting CSV file:", err);
                }
            });
        });
    } catch (error) {
        console.error('Error generating CSV data:', error);
        res.status(500).send('Error generating CSV file');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
