const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const mysql = require('mysql');
const validator = require('validator');
const bcrypt = require('bcrypt');
const session = require('express-session');
const csrf = require('csurf');

const app = express();
const port = 6789;


const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "cumparaturi"
});

const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/');   
    },
    filename: (req, file, cb) => {
        const nume = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
        cb(null, nume);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },   
    fileFilter: (req, file, cb) => {
        const tipuriPermise = /jpeg|jpg|png|webp/;
        const ok = tipuriPermise.test(file.mimetype);
        if (ok) cb(null, true);
        else cb(new Error('Doar imagini jpeg/jpg/png/webp sunt permise.'));
    }
});

// Map pentru tentative de login: ip -> { incercari, banPanaLa, multiplicator }
const loginAttempts = new Map();
// Map pentru erori 404: ip -> { count, resetLa, banPanaLa }
const erori404 = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_404_ERRORS = 15;
const BAN_DURATA_INITIAL = 15 * 60 * 1000;      // 15 minute in ms
const FEREASTRA_404 = 2 * 60 * 1000;             // 2 minute
const BAN_404 = 10 * 60 * 1000;                  // 10 minute

function getIP(req) {
    return req.ip || req.connection.remoteAddress;
}

con.connect((err) => {
    if (err) console.log("Eroare conectare MySQL:", err);
    else console.log("Conectat la baza de date!");
});

// Middleware rate limiting 404
function check404RateLimit(req, res, next) {
    const ip = getIP(req);
    const acum = Date.now();
    const date = erori404.get(ip) || { count: 0, resetLa: acum + FEREASTRA_404, banPanaLa: 0 };

    if (acum < date.banPanaLa) {
        const minute = Math.ceil((date.banPanaLa - acum) / 60000);
        return res.status(429).render('eroare', {
            utilizator: req.session.utilizator,
            mesaj: `Prea multe cereri suspecte. Acces blocat pentru încă ${minute} minute.`
        });
    }

    next();
}

function checkLoginRateLimit(req, res, next) {
    const ip = getIP(req);
    const acum = Date.now();
    const date = loginAttempts.get(ip) || { incercari: 0, banPanaLa: 0, multiplicator: 1 };

    if (acum < date.banPanaLa) {
        const minute = Math.ceil((date.banPanaLa - acum) / 60000);
        req.session.mesajEroare = `Prea multe încercări eșuate. Încearcă din nou în ${minute} minute.`;
        return res.redirect('/autentificare');
    }

    next();
}


app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(express.static('public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser())
app.use(session({
    secret: 'cheie-secreta',
    resave: true,
    saveUninitialized: false,
    cookie: {
        httpOnly: true, 
        secure: false,  
        sameSite: 'strict'
    }}));
app.use(csrf());
app.use(check404RateLimit);

function requireAuth(req, res, next) {
    if (!req.session.utilizator) return res.redirect('/autentificare');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.utilizator) return res.redirect('/autentificare');
    if (req.session.utilizator.rol !== 'ADMIN') {
        return res.status(403).render('eroare', {
            utilizator: req.session.utilizator,
            mesaj: '403 Forbidden — Nu ai acces la această pagină.'
        });
    }
    next();
}

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.get('/', (req, res) => {
    const mesajCos = req.session.mesajCos || null;
    req.session.mesajCos = null;

    con.query("SELECT * FROM produse", [], function (err, result) {
        res.render('index', {
            utilizator: req.session.utilizator,
            produse: err ? [] : (result || []),
            mesajCos: mesajCos
        });
    });
});

app.get('/chestionar', async (req, res) => {

    if (!req.session.utilizator) {
        return res.redirect('/autentificare');
    }

    try {
        const data = await fs.promises.readFile('resurse/intrebari.json', 'utf8');  
        const listaIntrebari = JSON.parse(data);

        res.render('chestionar', {
            intrebari: listaIntrebari,
            utilizator: req.session.utilizator,
            mesajEroare: req.session.mesajEroare,
            csrfToken: req.csrfToken()
        });
        req.session.mesajEroare = null;

    } catch (err) {
        res.send("Eroare la citirea fișierului JSON");
    }
});

app.post('/rezultat-chestionar', async (req, res) => {
    try {
        const data = await fs.promises.readFile('resurse/intrebari.json', 'utf8');
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

    } catch (err) {
        res.send("Eroare la citirea fișierului JSON");
    }
});

app.get('/autentificare', (req, res) => {
    if (req.session.utilizator) {
        return res.redirect('/');
    }
    const mesajEroare = req.session.mesajEroare;
    req.session.mesajEroare = null;
    res.render('autentificare', { mesajEroare: mesajEroare, csrfToken: req.csrfToken() });
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
                    pret DECIMAL(10,2) NOT NULL,
                    imagine VARCHAR(100)
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

app.get('/inserare-bd', async (req, res) => {
    try {
        const data = await fs.promises.readFile('resurse/carti.json', 'utf8');
        const carti = JSON.parse(data);

        const valori = carti.map(c => [c.titlu, c.autor, c.anAparitie, c.pret, c.imagine]);
        const sql = "INSERT INTO produse (titlu, autor, anAparitie, pret, imagine) VALUES ?";

        con.query(sql, [valori], function (err, result) {
            if (err) throw err;
            console.log("Au fost inserate " + result.affectedRows + " cărți.");
            res.redirect('/');
        });
    } catch (err) {
        res.send("Eroare la citirea carti.json");
    }
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

    const idProdus = Number.parseInt(req.query.id, 10);
    if (!Number.isInteger(idProdus)) return res.redirect('/');

    if (isNaN(idProdus)) return res.redirect('/');

    if (!req.session.cos) req.session.cos = {};

    const id = String(idProdus);
    req.session.cos[id] = (req.session.cos[id] || 0) + 1;

    console.log("Coș:", req.session.cos);

    req.session.mesajCos = "Produsul a fost adăugat în coș!";
    res.redirect('/');
});

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return validator.escape(validator.trim(input));
}


app.post('/verificare-autentificare', checkLoginRateLimit, async (req, res) => {
    const ip = getIP(req);
    const utilizator = sanitizeInput(req.body.utilizator);
    const parola = req.body.parola;

    if (!utilizator || !parola) {
        req.session.mesajEroare = "Te rugăm să introduci utilizator și parolă.";
        return res.redirect('/autentificare');
    }

    if (!validator.isLength(utilizator, { min: 3, max: 50 })) {
        req.session.mesajEroare = "Numele de utilizator trebuie să aibă între 3 și 50 de caractere.";
        return res.redirect('/autentificare');
    }

    try {
        const data = await fs.promises.readFile('resurse/utilizatori.json', 'utf8');
        const utilizatori = JSON.parse(data);
        const userGasit = utilizatori.find(u => u.utilizator === utilizator);

        const match = userGasit ? await bcrypt.compare(parola, userGasit.parola) : false;

        if (match) {
            loginAttempts.delete(ip);

            req.session.utilizator = {
                utilizator: userGasit.utilizator,
                nume: userGasit.nume,
                prenume: userGasit.prenume,
                rol: userGasit.rol
            };
            req.session.mesajEroare = null;
            return res.redirect('/');

        } else {
            const acum = Date.now();
            const date = loginAttempts.get(ip) || { incercari: 0, banPanaLa: 0, multiplicator: 1 };
            date.incercari++;

            if (date.incercari >= MAX_LOGIN_ATTEMPTS) {
                const durata = BAN_DURATA_INITIAL * date.multiplicator;
                date.banPanaLa = acum + durata;
                date.multiplicator = Math.min(date.multiplicator * 2, 8); 
                date.incercari = 0;

                const minute = Math.round(durata / 60000);
                loginAttempts.set(ip, date);
                req.session.mesajEroare = `Prea multe încercări eșuate. Acces blocat pentru ${minute} minute.`;
                return res.redirect('/autentificare');
            }

            const ramase = MAX_LOGIN_ATTEMPTS - date.incercari;
            loginAttempts.set(ip, date);
            req.session.mesajEroare = `Utilizator sau parolă incorectă. Mai ai ${ramase} încercări.`;
            return res.redirect('/autentificare');
        }

    } catch (e) {
        return res.send("Eroare server");
    }
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
    
app.get('/admin', requireAdmin, (req, res) => {
    res.render('admin', {
        utilizator: req.session.utilizator,
        mesaj: req.session.mesajAdmin || null,
        csrfToken: req.csrfToken()     
    });
    req.session.mesajAdmin = null;
});

app.post('/admin/adaugare-produs', requireAdmin, upload.single('imagine'), (req, res) => {
    const titlu = sanitizeInput(req.body.titlu);
    const autor = sanitizeInput(req.body.autor);
    const anAparitie = parseInt(req.body.anAparitie);
    const pret = parseFloat(req.body.pret);
    const imagine = req.file ? req.file.filename : null;

    if (!titlu || !autor || isNaN(anAparitie) || isNaN(pret)) {
        req.session.mesajAdmin = "Date invalide. Completează toate câmpurile.";
        return res.redirect('/admin');
    }

    con.query(
        "INSERT INTO produse (titlu, autor, anAparitie, pret, imagine) VALUES (?, ?, ?, ?, ?)",
        [titlu, autor, anAparitie, pret, imagine],
        async function(err) {
            if (err) {
                req.session.mesajAdmin = "Eroare la adăugare în baza de date.";
                return res.redirect('/admin');
            }

            // Sincronizare cu carti.json
            try {
                const data = await fs.promises.readFile('resurse/carti.json', 'utf8');
                const carti = JSON.parse(data);
                carti.unshift({ titlu, autor, anAparitie, pret, imagine });
                await fs.promises.writeFile('resurse/carti.json', JSON.stringify(carti, null, 4), 'utf8');
            } catch (errJson) {
                console.error("Eroare la actualizarea carti.json:", errJson);
                // Nu blocam redirectul — produsul e deja in BD
            }

            req.session.mesajAdmin = "Produsul a fost adăugat cu succes!";
            res.redirect('/admin');
        }
    );
});

// 404 handler — detecteaza scannere de vulnerabilitati
app.use((req, res) => {
    const ip = getIP(req);
    const acum = Date.now();
    const date = erori404.get(ip) || { count: 0, resetLa: acum + FEREASTRA_404, banPanaLa: 0 };

    // Reseteaza contorul daca fereastra a expirat
    if (acum > date.resetLa) {
        date.count = 0;
        date.resetLa = acum + FEREASTRA_404;
    }

    date.count++;

    if (date.count >= MAX_404_ERRORS) {
        date.banPanaLa = acum + BAN_404;
        date.count = 0;
        console.log(`[SECURITATE] IP ${ip} blocat pentru erori 404 excesive.`);
    }

    erori404.set(ip, date);

    res.status(404).render('eroare', {
        utilizator: req.session?.utilizator,
        mesaj: '404 — Pagina nu a fost găsită.'
    });
});

app.listen(port, () =>
    console.log(`Serverul rulează la adresa http://localhost:${port}/`)
);
