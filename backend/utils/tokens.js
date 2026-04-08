const crypto = require('crypto');

// SHA-256 хеш токена для хранения в БД.
// Соль не нужна: токены — 32/64-байтовые случайные строки с высокой энтропией,
// rainbow-table атаки неприменимы, а детерминированный хеш позволяет O(1) lookup по индексу.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { hashToken };
