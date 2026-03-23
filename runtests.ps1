if (Test-Path -Path .\errorlog.txt) {
    Remove-Item .\errorlog.txt
}

& sqlite3 -init "./db/initialize.sql" "./db/test.db" .quit
node .\chatbottest.js
