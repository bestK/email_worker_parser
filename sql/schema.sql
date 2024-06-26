
DROP TABLE IF EXISTS Email;


CREATE TABLE Email (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject VARCHAR(255),
    "from" VARCHAR(255),
    "to" VARCHAR(255),
    html TEXT,
    text TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);


DROP TABLE IF EXISTS Attachment;


CREATE TABLE Attachment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emailId INTEGER,
    filename VARCHAR(255),
    disposition VARCHAR(50),
    mimeType VARCHAR(100),
    size INTEGER,
    FOREIGN KEY (emailId) REFERENCES Email(id)
);
