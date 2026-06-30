require('dotenv').config();
const express = require('express');
const sql     = require('mssql');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ── Mapa de empresas ─────────────────────────────────────────
const EMPRESAS = {
    'ROMERAL':      'CROMERAL1',
    'BAKER DOS':    'CROMERAL2',
    'BAKER':        'CROMERAL3',
    'BAKER CUATRO': 'CROMERAL4',
    'BAKER CINCO':  'CROMERAL5',
};

// ── Configuración SQL Server (SQL Authentication) ────────────
const sqlConfig = {
    server:   'localhost\\SQLEXPRESS',
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    options: {
        trustServerCertificate: true,
        enableArithAbort:       true,
    }
};

// ── Health check ─────────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.json({ ok: true, mensaje: 'Baker API corriendo' });
});

// ── Endpoint: lista de empresas ──────────────────────────────
app.get('/empresas', (req, res) => {
    res.json({ empresas: Object.keys(EMPRESAS) });
});

// ── Endpoint: consulta de asientos ───────────────────────────
app.post('/asientos', async (req, res) => {
    const { empresa, ano, mes, voucher, rut } = req.body;

    if (!empresa || !EMPRESAS[empresa]) {
        return res.status(400).json({ error: 'Empresa no valida' });
    }
    if (!ano || !mes) {
        return res.status(400).json({ error: 'Año y mes son requeridos' });
    }

    const db = EMPRESAS[empresa];

    const anos  = (Array.isArray(ano)  ? ano  : [ano] ).map(a => String(a).trim()).filter(Boolean);
    const meses = (Array.isArray(mes)  ? mes  : [mes] ).map(m => String(m).trim()).filter(Boolean);

    if (anos.length === 0)  return res.status(400).json({ error: 'Selecciona al menos un año.' });
    if (meses.length === 0) return res.status(400).json({ error: 'Selecciona al menos un mes.' });

    try {
        const pool    = await sql.connect(sqlConfig);
        const request = pool.request();

        const anoPlaceholders = anos.map((a, i) => {
            request.input(`ano${i}`, sql.VarChar, a);
            return `@ano${i}`;
        });
        const mesPlaceholders = meses.map((m, i) => {
            request.input(`mes${i}`, sql.VarChar, m.padStart(2, '0'));
            return `@mes${i}`;
        });

        let query = `
            SELECT
                PctCod   AS [Cuenta Contable],
                CpbAno   AS [Año],
                CpbMes   AS [Mes],
                CpbNum   AS [Voucher],
                MovFe    AS [Fecha Asiento],
                CodAux   AS [RUT Auxiliar],
                MovDebe  AS [Debe],
                MovHaber AS [Haber],
                MovGlosa AS [Glosa Asiento]
            FROM [${db}].softland.cwmovim
            WHERE CpbAno IN (${anoPlaceholders.join(',')})
              AND CpbMes IN (${mesPlaceholders.join(',')})
        `;

        if (voucher && voucher.trim() !== '') {
            const vouchers = voucher.split(',').map(v => v.trim()).filter(Boolean);
            const vPlaceholders = vouchers.map((v, i) => {
                request.input(`v${i}`, sql.VarChar, v.padStart(8, '0'));
                return `@v${i}`;
            });
            query += ` AND CpbNum IN (${vPlaceholders.join(',')})`;
        }

        if (rut && rut.trim() !== '') {
            request.input('rut', sql.VarChar, rut.trim());
            query += ` AND CodAux = @rut`;
        }

        query += ` ORDER BY CpbAno ASC, CpbMes ASC, CpbNum ASC`;

        const result = await request.query(query);
        await sql.close();

        res.json({
            empresa,
            base_datos: db,
            anos:   anos,
            meses:  meses,
            total:  result.recordset.length,
            datos:  result.recordset
        });

    } catch (err) {
        console.error('Error SQL:', err.message);
        await sql.close().catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

// ── FIRMAS: control de "1 firma por persona" ──────────────────
// Se guarda en un archivo JSON simple (no requiere tabla SQL nueva)
const FIRMAS_FILE = path.join(__dirname, 'firmas_generadas.json');
const ADMIN_OVERRIDE = 'dvillaseca@ibaker.cl';

function leerFirmas() {
    try {
        if (!fs.existsSync(FIRMAS_FILE)) return {};
        return JSON.parse(fs.readFileSync(FIRMAS_FILE, 'utf8'));
    } catch (e) {
        console.error('Error leyendo firmas_generadas.json:', e.message);
        return {};
    }
}

function guardarFirmas(data) {
    fs.writeFileSync(FIRMAS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Verificar si un correo ya generó su firma
app.get('/firmas/check', (req, res) => {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Falta email' });

    if (email === ADMIN_OVERRIDE) {
        return res.json({ bloqueado: false });
    }

    const firmas = leerFirmas();
    if (firmas[email]) {
        return res.json({ bloqueado: true, datos: firmas[email] });
    }
    res.json({ bloqueado: false });
});

// Registrar que un correo generó su firma
app.post('/firmas/registrar', (req, res) => {
    const { email, sociedad } = req.body;
    const correo = (email || '').toLowerCase().trim();
    if (!correo) return res.status(400).json({ error: 'Falta email' });

    if (correo === ADMIN_OVERRIDE) {
        return res.json({ ok: true, admin: true });
    }

    const firmas = leerFirmas();
    firmas[correo] = {
        email: correo,
        sociedad: sociedad || '',
        fecha: new Date().toISOString()
    };
    guardarFirmas(firmas);
    res.json({ ok: true });
});

// Permite a TI (admin) liberar a alguien que necesite regenerar su firma
app.delete('/firmas/:email', (req, res) => {
    const correo = (req.params.email || '').toLowerCase().trim();
    const firmas = leerFirmas();
    if (firmas[correo]) {
        delete firmas[correo];
        guardarFirmas(firmas);
        return res.json({ ok: true, eliminado: correo });
    }
    res.json({ ok: true, eliminado: null });
});

// ── Iniciar servidor ─────────────────────────────────────────
const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('  =======================================');
    console.log('   Baker API corriendo en puerto ' + PORT);
    console.log('   http://localhost:' + PORT + '/ping');
    console.log('  =======================================');
    console.log('');
});
