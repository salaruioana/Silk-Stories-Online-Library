const express = require('express'); 
const expressLayouts = require('express-ejs-layouts'); 
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const mysql = require('mysql');
const app = express(); 
const port = 6789;
const session = require('express-session'); 
// directorul 'views' va conține fișierele .ejs (html + js executat la server) 
app.set('view engine', 'ejs'); 
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs 
app.use(expressLayouts); 
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini) 
app.use(express.static('public')) 
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body 
app.use(bodyParser.json()); 
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte 
app.use(bodyParser.urlencoded({ extended: true })); 
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World' 
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req 
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res 
app.use(cookieParser())
app.use(session({secret:'cheie-secreta',resave: false, saveUninitialized:false}));
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
app.get('/', (req, res) => {

    const con = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "cumparaturi"
    });

    con.connect(function (err) {

        if (err) {
            return res.render('index', {
                utilizator: req.session.utilizator,
                produse: []
            });
        }

        con.query("SELECT * FROM produse", function (err, result) {

            if (err) {
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
});
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată 
app.get('/chestionar', (req, res) => {

    if (!req.session.utilizator) {
        return res.redirect('/autentificare');
    }

    const utilizator = req.session.utilizator;
    const mesajEroare = req.session.mesajEroare;

    fs.readFile('intrebari.json', 'utf8', (err, data) => {
        if (err) {
            return res.send("Eroare la citirea fișierului JSON");
        }

        const listaIntrebari = JSON.parse(data);

        res.render('chestionar', {intrebari: listaIntrebari, utilizator: utilizator, mesajEroare: mesajEroare});
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
            total: listaIntrebari.length
        });
    });
});
app.get('/autentificare', (req,res)=>{
    if (req.session.utilizator) {
        return res.redirect('/');
    }
    const mesajEroare = req.session.mesajEroare;
    req.session.mesajEroare = null;
    res.render('autentificare', {mesajEroare: mesajEroare});
}
)
app.get('/logout', (req,res)=>{
    req.session.destroy();
    res.redirect('/autentificare');
})
app.get('/creare-bd', (req, res) => {
    const con = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: ""
    });

    con.connect(function (err) {
        if (err) throw err;
        console.log("Connected");

        con.query("CREATE DATABASE IF NOT EXISTS cumparaturi", function (err, result) {
            if (err) throw err;
            console.log("Database 'cumparaturi' creată");

            con.query("USE cumparaturi");

            const sqlTabel = `
                CREATE TABLE IF NOT EXISTS produse (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    titlu VARCHAR(100) NOT NULL,
                    autor VARCHAR(100) NOT NULL,
                    anAparitie DECIMAL(4) NOT NULL,
                    pret DECIMAL(10,2) NOT NULL
                )
            `;

            con.query(sqlTabel, function (err, result) {
                if (err) throw err;
                console.log("Tabel 'produse' creat");
            });
        });
    });

    res.redirect('/');
});
app.get('/inserare-bd', (req, res) => {

    const con = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "cumparaturi"
    });

    con.connect(function (err) {
        if (err) throw err;
        console.log("Conectat la baza de date!");

        const carti = [
            ["1984", "George Orwell", 1949, 39.99],
            ["Harry Potter și Piatra Filozofală", "J.K. Rowling", 1997, 44.90],
            ["Mândrie și Prejudecată", "Jane Austen", 1813, 29.50],
            ["Micul Prinț", "Antoine de Saint-Exupéry", 1943, 24.99],
            ["Stăpânul Inelelor: Frăția Inelului", "J.R.R. Tolkien", 1954, 59.99],
            ["Hobbitul", "J.R.R. Tolkien", 1937, 34.99],
            ["Fahrenheit 451", "Ray Bradbury", 1953, 36.50],
            ["Crimă și Pedepasă", "F.M. Dostoievski", 1866, 32.00],
            ["Jocurile Foamei", "Suzanne Collins", 2008,  41.00],
            ["Dune", "Frank Herbert", 1965, 55.00]
        ];

        const sql = "INSERT INTO produse (titlu, autor, anAparitie, pret) VALUES ?";

        con.query(sql, [carti], function (err, result) {
            if (err) throw err;

            console.log("Au fost inserate " + result.affectedRows + " cărți.");
            res.redirect('/');
        });
    });
});
app.get('/stergere-bd', (req, res) => {

    const con = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "cumparaturi"
    });

    con.connect(function (err) {
        if (err) throw err;
        console.log("Conectat la baza de date!");

        const sql = "DROP TABLE produse";

        con.query(sql, function (err, result) {
            if (err) throw err;

            console.log("Au fost șterse toate produsele!");

            res.redirect('/');
        });
    });
});
app.post('/verificare-autentificare', (req, res) => {
    const utilizator = req.body.utilizator;
    const parola = req.body.parola;

    fs.readFile('resurse/utilizatori.json', 'utf8', (err, data) => {

        if (err) return res.send("Eroare fisier");

        const utilizatori = JSON.parse(data);

        const userGasit = utilizatori.find(u =>
            u.utilizator === utilizator && u.parola === parola
        );

        if (userGasit) {

            delete userGasit.parola;

            req.session.utilizator = userGasit;

            req.session.mesajEroare = null;

            return res.redirect('/');

        } else {

            req.session.mesajEroare = "Utilizator sau parola incorecta";

            return res.redirect('/autentificare');
        }
    });
});
 
app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost: ${port}/`)); 