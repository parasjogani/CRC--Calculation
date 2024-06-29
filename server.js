const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 4000;

// Function to generate a random 8-digit alphanumeric UID without lowercase characters
function generateUID() {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var uid = '';
    for (var i = 0; i < 8; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// Function to convert string to HEX
function stringToHex(str) {
    var hex = '';
    for (var i = 0; i < str.length; i++) {
        hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
}

// Function to insert the UID HEX value into the 148-byte HEX string at the specified positions
function insertUIDIntoHex(hexString, uidHex) {
    var start = 26 * 2; // Byte 27 (0-based index)
    var end = 34 * 2;   // Byte 34 (0-based index)
    return hexString.substring(0, start) + uidHex + hexString.substring(end);
}

// CRC16ModbusMaster definition
var CRC16ModbusMaster = {
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
        var crc = 0xFFFF;
        var str = this.CleanedString;
        for (var pos = 0; pos < str.length; pos++) {
            crc ^= str.charCodeAt(pos);
            for (var i = 8; i !== 0; i--) {
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
        var hex = inputstr.toString();
        var str = '';
        for (var i = 0; i < hex.length; i += 2) {
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
function generateCSVData() {
    var fixedPart = "1002200181080000000000000000000000000000000000000000566972414c313233000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    var hexString = fixedPart.padEnd(296, '0');
    var csvContent = "";

    for (var i = 0; i < 5000; i++) {
        var uidForCSV = generateUID();
        var uidForCRC = generateUID();
        var uidHex = stringToHex(uidForCRC);
        var updatedHexString = insertUIDIntoHex(hexString, uidHex);
        var crcValue = CRC16ModbusMaster.Calculate(updatedHexString);
        var crcHex = crcValue.toString(16).toUpperCase().padStart(4, '0');
        var finalUIDHex = uidHex + crcHex;
        csvContent += uidForCSV + ";" + finalUIDHex + "\n";
    }

    return csvContent;
}

// Serve the CSV file
app.get('/download', (req, res) => {
    const csvData = generateCSVData();
    const filePath = path.join(__dirname, 'uid_crc_data.csv');
    fs.writeFileSync(filePath, csvData);
    res.download(filePath, 'uid_crc_data.csv', (err) => {
        if (err) {
            console.error(err);
        }
        fs.unlinkSync(filePath);
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
