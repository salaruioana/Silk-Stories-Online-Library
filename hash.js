const bcrypt = require('bcrypt');

const parola = "admin123";

bcrypt.hash(parola, 10, (err, hash) => {
    console.log(hash);
});