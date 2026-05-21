const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const mysql = require('mysql');
const app = express();
const port = 6789;
const validator = require('validator');
const bcrypt = require('bcrypt');
const session = require('express-session');

const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "cumparaturi"
});

con.connect((err) => {
    if (err) console.log("Eroare conectare MySQL:", err);
    else console.log("Conectat la baza de date!");
});


app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(express.static('public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser())
app.use(session({ secret: 'cheie-secreta', resave: false, saveUninitialized: false }));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.get('/', (req, res) => {

    con.query("SELECT * FROM produse",[], function (err, result) {

        if (err) {
            con.end();
            return res.render('index', {
                utilizator: req.session.utilizator,
                produse: []
            });
        }

        res.render('index', {
            utilizator: req.session.utilizator,
            produse: result || []
        });
    });
});

app.get('/chestionar', (req, res) => {

    if (!req.session.utilizator) {
        return res.redirect('/autentificare');
    }

    const utilizator = req.session.utilizator;
    const mesajEroare = req.session.mesajEroare;

    req.session.mesajEroare = null;

    fs.readFile('intrebari.json', 'utf8', (err, data) => {
        if (err) {
            return res.send("Eroare la citirea fișierului JSON");
        }

        const listaIntrebari = JSON.parse(data);

        res.render('chestionar', {
            intrebari: listaIntrebari,
            utilizator: utilizator,
            mesajEroare: mesajEroare
        });
    });
});

app.post('/rezultat-chestionar', (req, res) => {
    fs.readFile('intrebari.json', 'utf8', (err, data) => {
        if (err) {
            return res.send("Eroare la citirea fișierului JSON");
        }

        const listaIntrebari = JSON.parse(data);

        let scor = 0;

        for (let i = 0; i < listaIntrebari.length; i++) {
            if (req.body["q" + i] == listaIntrebari[i].corect) {
                scor++;
            }
        }

        res.render('rezultat', {
            scor: scor,
            total: listaIntrebari.length,
            utilizator: req.session.utilizator
        });
    });
});



app.get('/autentificare', (req, res) => {
    if (req.session.utilizator) {
        return res.redirect('/');
    }
    const mesajEroare = req.session.mesajEroare;
    req.session.mesajEroare = null;
    res.render('autentificare', { mesajEroare: mesajEroare });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/autentificare');
});

app.get('/creare-bd', (req, res) => {
    const conLocal = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: ""
    });

    conLocal.connect(function (err) {
        if (err) throw err;

        conLocal.query("CREATE DATABASE IF NOT EXISTS cumparaturi", function (err, result) {
            if (err) throw err;

            const sqlTabel = `
                CREATE TABLE IF NOT EXISTS produse (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    titlu VARCHAR(100) NOT NULL,
                    autor VARCHAR(100) NOT NULL,
                    anAparitie DECIMAL(4) NOT NULL,
                    pret DECIMAL(10,2) NOT NULL
                )
            `;

            conLocal.query("USE cumparaturi", function (err) {
                if (err) throw err;

                conLocal.query(sqlTabel, function (err) {
                    if (err) throw err;
                    conLocal.end();
                });
            });
        });
    });

    res.redirect('/');
});

app.get('/inserare-bd', (req, res) => {

    const carti = [
        ["1984", "George Orwell", 1949, 39.99],
        ["Harry Potter și Piatra Filozofală", "J.K. Rowling", 1997, 44.90],
        ["Mândrie și Prejudecată", "Jane Austen", 1813, 29.50],
        ["Micul Prinț", "Antoine de Saint-Exupéry", 1943, 24.99],
        ["Stăpânul Inelelor: Frăția Inelului", "J.R.R. Tolkien", 1954, 59.99],
        ["Hobbitul", "J.R.R. Tolkien", 1937, 34.99],
        ["Fahrenheit 451", "Ray Bradbury", 1953, 36.50],
        ["Crimă și Pedepasă", "F.M. Dostoievski", 1866, 32.00],
        ["Jocurile Foamei", "Suzanne Collins", 2008, 41.00],
        ["Dune", "Frank Herbert", 1965, 55.00]
    ];


    const sql = "INSERT INTO produse (titlu, autor, anAparitie, pret) VALUES ?";

    con.query(sql, [carti], function (err, result) {
        if (err) throw err;
        console.log("Au fost inserate " + result.affectedRows + " cărți.");
        res.redirect('/');
    });
});

app.get('/stergere-bd', (req, res) => {

    con.query("DROP TABLE IF EXISTS produse", function (err, result) {
        if (err) throw err;

        console.log("Tabel șters!");
        res.redirect('/');
    });
});

app.get('/adaugare-cos', (req, res) => {
    if (!req.session.utilizator) {
        return res.redirect('/autentificare');
    }

    const idProdus = parseInt(req.query.id);

    if (isNaN(idProdus)) return res.redirect('/');

    if (!req.session.cos) req.session.cos = {};

    const id = String(idProdus);
    req.session.cos[id] = (req.session.cos[id] || 0) + 1;

    console.log("Coș:", req.session.cos);

    res.redirect('/');
});

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return validator.escape(validator.trim(input));
}

app.post('/verificare-autentificare', (req, res) => {
    const utilizator = sanitizeInput(req.body.utilizator);
    const parola = req.body.parola;

     if (!utilizator || !parola) {
        req.session.mesajEroare = "Date invalide";
        return res.redirect('/autentificare');
    }

    fs.readFile('resurse/utilizatori.json', 'utf8', (err, data) => {
        if (err) return res.send("Eroare fisier");

        const utilizatori = JSON.parse(data);

        const userGasit = utilizatori.find(u =>
            u.utilizator === utilizator);

        
        if (!userGasit) {
            req.session.mesajEroare = "Utilizator sau parola incorecta";
            return res.redirect('/autentificare');
        }

        try {
            const match = await bcrypt.compare(parola, userGasit.parola);

            if (match) {
                req.session.utilizator = {
                    utilizator: userGasit.utilizator,
                    nume: userGasit.nume,
                    prenume: userGasit.prenume
                };

                req.session.mesajEroare = null;
                return res.redirect('/');
            } else {
                req.session.mesajEroare = "Utilizator sau parola incorecta";
                return res.redirect('/autentificare');
            }

        } catch (e) {
            return res.send("Eroare bcrypt");
        }
    });
});



app.get('/vizualizare-cos', (req, res) => {

    if (!req.session.utilizator) {
        return res.redirect('/autentificare');
    }

    const cos = req.session.cos || {};
    const iduri = Object.keys(cos).map(Number);

    if (iduri.length === 0) {
        return res.render('vizualizare-cos', {
            utilizator: req.session.utilizator,
            produse: [],
            cos: {}
        });
    }

    con.query("SELECT * FROM produse WHERE id IN (?)", [iduri], function (err, result) {

        if (err) {
            return res.render('vizualizare-cos', {
                utilizator: req.session.utilizator,
                produse: []
            });
        }

        res.render('vizualizare-cos', {
            utilizator: req.session.utilizator,
            produse: result || [],
            cos: cos
        });
    });
});

app.listen(port, () =>
    console.log(`Serverul rulează la adresa http://localhost:${port}/`)
);