import fs from 'fs';

export default class Logger {
    static log(text) {
        const logText = Logger.getLine(text);
        console.log(logText);
    }

    static error(text) {
        const logText = Logger.getLine(text);
        console.log(logText);
        fs.appendFile("./errorlog.txt", `${logText}\n`, (err) => {
            if (err) console.log(err);
        });
    }

    static getLine(text) {
        const timeStamp = (new Date()).toISOString();
        const printedText = typeof(text) === "string" ? text : JSON.stringify(text);
        return `${timeStamp} | ${printedText}`;
    }
}
