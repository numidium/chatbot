import Database from 'better-sqlite3';

export default class DatabaseManager {
    dbPath;
    constructor(dbPath_) {
        this.dbPath = dbPath_;
    }

    getConnection() {
        return new Database(this.dbPath, {});
    }

    getResultSet(statement, args) {
        const connection = this.getConnection();
        const query = connection.prepare(statement);
        const result = query.all(...args);
        connection.close();

        return result;
    }

    runStatement(statement, args) {
        const connection = this.getConnection();
        const job = connection.prepare(statement);
        const result = job.run(...args);
        connection.close();

        return result;
    }

    runBatch(statement, rows, args) {
        const connection = this.getConnection();
        const job = connection.prepare(statement);
        const transaction = connection.transaction((rows) => {
            for (let i = 0; i < rows.length; i++) {
                for (let j = 0; j < args.length; j++) {
                    job.run(rows[i][args[j]]);
                }
            }
        });

        const result = transaction();
        connection.close();

        return result;
    }
}
