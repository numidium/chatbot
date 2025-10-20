export default class DatabaseManager {
    sqlite;
    dbPath;
    constructor(sqlite_, dbPath_) {
        this.sqlite = sqlite_;
        this.dbPath = dbPath_;
    }

    asyncGet(db, sql, params) {
        const promise = new Promise((resolve, reject) => {
            db.get(sql, params, (err, ret) => {
                if (err) reject(err);
                resolve(ret);
            });
        });

        return promise;
    }

    asyncRun(db, sql, params) {
        const promise = new Promise((resolve, reject) => {
            db.run(sql, params, (err, ret) => {
                if (err) reject(err);
                resolve(ret);
            });
        });

        return promise;
    }

    asyncAll(db, sql, params) {
        const promise = new Promise((resolve, reject) => {
            db.all(sql, params, (err, ret) => {
                if (err) reject(err);
                resolve(ret);
            });
        });

        return promise;
    }
}
