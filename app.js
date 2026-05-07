const express = require('express'); 
const expressLayouts = require('express-ejs-layouts'); 
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const app = express(); 
const port = 6789; 
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
app.get('/', (req, res) => {
    const utilizator = req.cookies.utilizator;
    res.render('index',{ utilizator: utilizator});
});
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată 
app.get('/chestionar', (req, res) => {

    if (!req.cookies.utilizator) {
        return res.redirect('/autentificare');
    }

    const utilizator = req.cookies.utilizator;
    const mesajEroare = req.cookies.mesajEroare;

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
    if (req.cookies.utilizator) {
        return res.redirect('/');
    }
    const mesajEroare = req.cookies.mesajEroare;
    res.render('autentificare', {mesajEroare: mesajEroare});
}
)
app.post('/verificare-autentificare', (req, res) => {
    console.log(req.body);
    const utilizator = req.body.utilizator;
    const parola = req.body.parola;
    if (utilizator === "Ioana" && parola === "IoanaIa10") {
        res.clearCookie("mesajEroare");
        res.cookie("utilizator",utilizator);
        res.redirect('/');
    } else {
        res.cookie("mesajEroare","Utilizator sau parola incorecta");
        res.redirect('/autentificare');
    }
});
 
app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost: ${port}/`)); 