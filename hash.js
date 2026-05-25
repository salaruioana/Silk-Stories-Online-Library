const bcrypt = require('bcrypt');

const parola = "parolafoartegrea";

bcrypt.hash(parola, 10, (err, hash) => {
    console.log(hash);
});