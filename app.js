const express = require('express'); 
const expressLayouts = require('express-ejs-layouts'); 
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
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
    res.render('index',{ utilizator: req.session.utilizator});
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