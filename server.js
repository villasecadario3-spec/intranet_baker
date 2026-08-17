require('dotenv').config();
const express  = require('express');
const sql      = require('mssql');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const os       = require('os');
const { exec } = require('child_process');
const multer   = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

const EMPRESAS = {
    'ROMERAL':      'CROMERAL1',
    'BAKER DOS':    'CROMERAL2',
    'BAKER':        'CROMERAL3',
    'BAKER CUATRO': 'CROMERAL4',
    'BAKER CINCO':  'CROMERAL5',
};

const sqlConfig = {
    server:   'localhost\\SQLEXPRESS',
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    options: { trustServerCertificate: true, enableArithAbort: true }
};

app.get('/ping', (req, res) => res.json({ ok: true, mensaje: 'Baker API corriendo' }));
app.get('/empresas', (req, res) => res.json({ empresas: Object.keys(EMPRESAS) }));

app.post('/asientos', async (req, res) => {
    const { empresa, ano, mes, voucher, rut } = req.body;
    if (!empresa || !EMPRESAS[empresa]) return res.status(400).json({ error: 'Empresa no valida' });
    if (!ano || !mes) return res.status(400).json({ error: 'Año y mes son requeridos' });
    const db = EMPRESAS[empresa];
    const anos  = (Array.isArray(ano) ? ano : [ano]).map(a => String(a).trim()).filter(Boolean);
    const meses = (Array.isArray(mes) ? mes : [mes]).map(m => String(m).trim()).filter(Boolean);
    if (!anos.length)  return res.status(400).json({ error: 'Selecciona al menos un año.' });
    if (!meses.length) return res.status(400).json({ error: 'Selecciona al menos un mes.' });
    try {
        const pool = await sql.connect(sqlConfig);
        const request = pool.request();
        const anoPlaceholders = anos.map((a, i) => { request.input(`ano${i}`, sql.VarChar, a); return `@ano${i}`; });
        const mesPlaceholders = meses.map((m, i) => { request.input(`mes${i}`, sql.VarChar, m.padStart(2,'0')); return `@mes${i}`; });
        let query = `SELECT PctCod AS [Cuenta Contable], CpbAno AS [Año], CpbMes AS [Mes], CpbNum AS [Voucher], MovFe AS [Fecha Asiento], CodAux AS [RUT Auxiliar], MovDebe AS [Debe], MovHaber AS [Haber], MovGlosa AS [Glosa Asiento] FROM [${db}].softland.cwmovim WHERE CpbAno IN (${anoPlaceholders.join(',')}) AND CpbMes IN (${mesPlaceholders.join(',')})`;
        if (voucher && voucher.trim()) {
            const vouchers = voucher.split(',').map(v => v.trim()).filter(Boolean);
            const vPH = vouchers.map((v,i) => { request.input(`v${i}`, sql.VarChar, v.padStart(8,'0')); return `@v${i}`; });
            query += ` AND CpbNum IN (${vPH.join(',')})`;
        }
        if (rut && rut.trim()) { request.input('rut', sql.VarChar, rut.trim()); query += ` AND CodAux = @rut`; }
        query += ` ORDER BY CpbAno ASC, CpbMes ASC, CpbNum ASC`;
        const result = await request.query(query);
        await sql.close();
        res.json({ empresa, base_datos: db, anos, meses, total: result.recordset.length, datos: result.recordset });
    } catch (err) {
        console.error('Error SQL:', err.message);
        await sql.close().catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

const FIRMAS_FILE    = path.join(__dirname, 'firmas_generadas.json');
const ADMIN_OVERRIDE = 'dvillaseca@ibaker.cl';
function leerFirmas() { try { if (!fs.existsSync(FIRMAS_FILE)) return {}; return JSON.parse(fs.readFileSync(FIRMAS_FILE,'utf8')); } catch(e) { return {}; } }
function guardarFirmas(d) { fs.writeFileSync(FIRMAS_FILE, JSON.stringify(d,null,2),'utf8'); }
app.get('/firmas/check', (req, res) => {
    const email = (req.query.email||'').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Falta email' });
    if (email === ADMIN_OVERRIDE) return res.json({ bloqueado: false });
    const firmas = leerFirmas();
    res.json(firmas[email] ? { bloqueado: true, datos: firmas[email] } : { bloqueado: false });
});
app.post('/firmas/registrar', (req, res) => {
    const correo = (req.body.email||'').toLowerCase().trim();
    if (!correo) return res.status(400).json({ error: 'Falta email' });
    if (correo === ADMIN_OVERRIDE) return res.json({ ok: true, admin: true });
    const firmas = leerFirmas();
    firmas[correo] = { email: correo, sociedad: req.body.sociedad||'', fecha: new Date().toISOString() };
    guardarFirmas(firmas);
    res.json({ ok: true });
});
app.delete('/firmas/:email', (req, res) => {
    const correo = (req.params.email||'').toLowerCase().trim();
    const firmas = leerFirmas();
    if (firmas[correo]) { delete firmas[correo]; guardarFirmas(firmas); return res.json({ ok: true, eliminado: correo }); }
    res.json({ ok: true, eliminado: null });
});

const PROYECTOS_FILE = path.join(__dirname, 'proyectos.json');
const PROYECTOS_SEED = [
    { id:'seed-0',  ciudad:'MELIPILLA',    proyecto:'PORTAL ORIENTE I',    abrev:'PO I',   creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-1',  ciudad:'MELIPILLA',    proyecto:'PORTAL ORIENTE II',   abrev:'PO II',  creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-2',  ciudad:'MELIPILLA',    proyecto:'PORTAL ORIENTE III',  abrev:'PO III', creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-3',  ciudad:'MELIPILLA',    proyecto:'PORTAL ORIENTE IV',   abrev:'PO IV',  creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-4',  ciudad:'SANTA_CRUZ',   proyecto:'VALLES DE APALTA',    abrev:'VDA',    creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-5',  ciudad:'REQUINOA',     proyecto:'PORTAL EL ABRA I',    abrev:'PEA I',  creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-6',  ciudad:'RENGO',        proyecto:'QUILLAYES',           abrev:'QUI',    creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-7',  ciudad:'RENGO',        proyecto:'PARQUE BALUARTE I',   abrev:'PB I',   creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-8',  ciudad:'RENGO',        proyecto:'PARQUE BALUARTE II',  abrev:'PB II',  creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-9',  ciudad:'RENGO',        proyecto:'ALTO SAN MARTIN I',   abrev:'ASM I',  creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-10', ciudad:'RENGO',        proyecto:'ALTO SAN MARTIN II',  abrev:'ASM II', creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-11', ciudad:'SAN_FERNANDO', proyecto:'VILLA SAN FRANCISCO', abrev:'VSF',    creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-12', ciudad:'ROMERAL',      proyecto:'PORTAL LA CAÑADA II', abrev:'PLC II', creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
    { id:'seed-13', ciudad:'CONSTITUCIÓN', proyecto:'ROCAS DE LA IGLESIA', abrev:'RDLI',   creadoPor:null, fecha:'2026-07-08T00:00:00.000Z' },
];
function leerProyectos() { try { if (!fs.existsSync(PROYECTOS_FILE)) { guardarProyectos(PROYECTOS_SEED); return PROYECTOS_SEED; } return JSON.parse(fs.readFileSync(PROYECTOS_FILE,'utf8')); } catch(e) { return []; } }
function guardarProyectos(l) { fs.writeFileSync(PROYECTOS_FILE, JSON.stringify(l,null,2),'utf8'); }
app.get('/proyectos', (req, res) => res.json(leerProyectos()));
app.post('/proyectos', (req, res) => {
    const { ciudad, proyecto, abrev } = req.body;
    if (!ciudad||!proyecto||!abrev) return res.status(400).json({ error: 'Faltan campos: ciudad, proyecto, abrev' });
    const lista = leerProyectos();
    if (lista.some(p => p.ciudad.toUpperCase()===ciudad.toUpperCase() && p.proyecto.toUpperCase()===proyecto.toUpperCase()))
        return res.status(409).json({ error: 'Ese proyecto ya existe en esa ciudad' });
    const nuevo = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), ciudad: ciudad.toUpperCase().trim(), proyecto: proyecto.trim(), abrev: abrev.trim(), creadoPor: req.body.creadoPor||null, fecha: new Date().toISOString() };
    lista.push(nuevo); guardarProyectos(lista); res.json(nuevo);
});
app.delete('/proyectos/:id', (req, res) => {
    const lista = leerProyectos();
    const filtrada = lista.filter(p => p.id !== req.params.id);
    if (filtrada.length === lista.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    guardarProyectos(filtrada); res.json({ ok: true });
});

const DOCS_CONFIG_FILE = path.join(__dirname, 'documentos_config.json');
function leerDocsConfig() { try { if (!fs.existsSync(DOCS_CONFIG_FILE)) return []; return JSON.parse(fs.readFileSync(DOCS_CONFIG_FILE,'utf8')); } catch(e) { console.error('Error leyendo documentos_config.json:', e.message); return []; } }
function guardarDocsConfig(lista) { fs.writeFileSync(DOCS_CONFIG_FILE, JSON.stringify(lista,null,2),'utf8'); }
app.get('/docs-config', (req, res) => res.json(leerDocsConfig()));
app.post('/docs-config', (req, res) => {
    const { carpetaValor, documento, abrev, tipo } = req.body;
    if (!carpetaValor||!documento||!abrev||!tipo) return res.status(400).json({ error: 'Faltan campos: carpetaValor, documento, abrev, tipo' });
    const lista = leerDocsConfig();
    if (lista.some(d => d.carpetaValor===carpetaValor && d.documento.toUpperCase()===documento.toUpperCase() && d.tipo===tipo))
        return res.status(409).json({ error: 'Ya existe ese documento en esa carpeta' });
    const nuevo = { id:Date.now().toString(36)+Math.random().toString(36).slice(2,6), carpetaValor:carpetaValor.trim(), documento:documento.trim(), abrev:abrev.trim(), tipo:tipo.trim(), fecha:new Date().toISOString() };
    lista.push(nuevo); guardarDocsConfig(lista); res.json(nuevo);
});
app.delete('/docs-config/:id', (req, res) => {
    const lista = leerDocsConfig();
    const filtrada = lista.filter(d => d.id !== req.params.id);
    if (filtrada.length === lista.length) return res.status(404).json({ error: 'No encontrado' });
    guardarDocsConfig(filtrada); res.json({ ok: true });
});

const HISTORIAL_FILE = path.join(__dirname, 'historial_proyectos.json');
const HISTORIAL_MAX  = 300;
function leerHistorial() { try { if (!fs.existsSync(HISTORIAL_FILE)) return []; return JSON.parse(fs.readFileSync(HISTORIAL_FILE,'utf8')); } catch(e) { return []; } }
function guardarHistorial(l) { fs.writeFileSync(HISTORIAL_FILE, JSON.stringify(l,null,2),'utf8'); }
app.get('/historial', (req, res) => res.json(leerHistorial()));
app.post('/historial', (req, res) => {
    const { nombre, accion, ruta, email, fecha } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const lista = leerHistorial();
    const nuevo = { nombre, accion:accion||'copiado', ruta:ruta||'', email:(email||'desconocido').toLowerCase(), fecha:fecha||new Date().toISOString() };
    lista.unshift(nuevo);
    if (lista.length > HISTORIAL_MAX) lista.length = HISTORIAL_MAX;
    guardarHistorial(lista); res.json(nuevo);
});

const DOCS_FILE    = path.join(__dirname, 'docs_pendientes.json');
const GITHUB_OWNER = 'villasecadario3-spec';
const GITHUB_REPO  = 'intranet_baker';
const APROBADORES  = ['dvillaseca@ibaker.cl', 'jcumplido@ibaker.cl'];
function leerPendientes() { try { if (!fs.existsSync(DOCS_FILE)) return []; return JSON.parse(fs.readFileSync(DOCS_FILE,'utf8')); } catch(e) { return []; } }
function guardarPendientes(d) { fs.writeFileSync(DOCS_FILE, JSON.stringify(d,null,2),'utf8'); }

app.post('/docs/pendiente', (req, res) => {
    const { nombre, descripcion, archivo, tipo, subidoPor } = req.body;
    if (!nombre||!archivo||!subidoPor) return res.status(400).json({ error: 'Faltan datos obligatorios' });
    const id = Date.now().toString();
    const pendientes = leerPendientes();
    pendientes.push({ id, nombre, descripcion, archivo, tipo, subidoPor, fecha:new Date().toISOString(), estado:'pendiente' });
    guardarPendientes(pendientes); res.json({ ok:true, id });
});
app.get('/docs/pendientes', (req, res) => {
    const email = (req.query.email||'').toLowerCase();
    if (!APROBADORES.includes(email)) return res.status(403).json({ error: 'Sin acceso' });
    res.json(leerPendientes().filter(d => d.estado === 'pendiente'));
});
app.get('/docs/preview/:id', (req, res) => {
    const email = (req.query.email||'').toLowerCase();
    if (!APROBADORES.includes(email)) return res.status(403).json({ error: 'Sin acceso' });
    const doc = leerPendientes().find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json({ archivo:doc.archivo, tipo:doc.tipo, nombre:doc.nombre });
});
app.post('/docs/aprobar/:id', async (req, res) => {
    const email = (req.body.email||'').toLowerCase();
    if (!APROBADORES.includes(email)) return res.status(403).json({ error: 'Sin permiso' });
    const pendientes = leerPendientes();
    const doc = pendientes.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    try {
        const nombreArchivo = doc.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 _-]/g,'').trim().replace(/ +/g,'_')+'.'+(doc.tipo||'pdf');
        const githubPath = `docs/${nombreArchivo}`;
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        let sha;
        try {
            const check = await new Promise((resolve, reject) => {
                const opts = { hostname:'api.github.com', path:`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`, method:'GET', headers:{ 'Authorization':`Bearer ${GITHUB_TOKEN}`, 'Accept':'application/vnd.github+json', 'User-Agent':'Baker-Intranet/1.0' } };
                const r = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); });
                r.on('error',reject); r.end();
            });
            if (check.status === 200) sha = JSON.parse(check.body).sha;
        } catch(e) {}
        console.log('[GitHub] Owner:', GITHUB_OWNER, '| Repo:', GITHUB_REPO, '| Path:', githubPath);
        console.log('[GitHub] Token prefix:', process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.substring(0,20)+'...' : 'NO TOKEN');
        const body = JSON.stringify({ message:`Documento aprobado: ${doc.nombre}`, content:doc.archivo, ...(sha?{sha}:{}), committer:{ name:'Intranet Baker', email:'ti@ibaker.cl' } });
        const result = await new Promise((resolve, reject) => {
            const opts = { hostname:'api.github.com', path:`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`, method:'PUT', headers:{ 'Authorization':`Bearer ${GITHUB_TOKEN}`, 'Accept':'application/vnd.github+json', 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body), 'User-Agent':'Baker-Intranet/1.0' } };
            const r = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); });
            r.on('error',reject); r.write(body); r.end();
        });
        if (result.status!==200&&result.status!==201) throw new Error(`GitHub: ${result.status} — ${result.body.substring(0,200)}`);
        doc.estado='aprobado'; doc.aprobadoPor=email; doc.fechaAprobacion=new Date().toISOString(); doc.archivoGithub=nombreArchivo;
        guardarPendientes(pendientes); res.json({ ok:true, archivo:nombreArchivo });
    } catch(err) { console.error('Error aprobando doc:', err.message); res.status(500).json({ error:err.message }); }
});
app.post('/docs/rechazar/:id', (req, res) => {
    const email = (req.body.email||'').toLowerCase();
    if (!APROBADORES.includes(email)) return res.status(403).json({ error: 'Sin permiso' });
    const pendientes = leerPendientes();
    const doc = pendientes.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    doc.estado='rechazado'; doc.rechazadoPor=email; doc.motivoRechazo=req.body.motivo||''; doc.fechaRechazo=new Date().toISOString();
    guardarPendientes(pendientes); res.json({ ok:true });
});

const HISTORIAL_CARTAS_FILE = path.join(__dirname, 'historial_cartas.json');
const HISTORIAL_CARTAS_MAX  = 200;
function leerHistorialCartas() { try { if (!fs.existsSync(HISTORIAL_CARTAS_FILE)) return []; return JSON.parse(fs.readFileSync(HISTORIAL_CARTAS_FILE,'utf8')); } catch(e) { return []; } }
function guardarHistorialCartas(lista) { fs.writeFileSync(HISTORIAL_CARTAS_FILE, JSON.stringify(lista,null,2),'utf8'); }
app.get('/historial-cartas', (req, res) => res.json(leerHistorialCartas()));
app.post('/historial-cartas', (req, res) => {
    const { email, archivo, totalCartas, accion } = req.body;
    if (!email) return res.status(400).json({ error: 'Falta email' });
    const lista = leerHistorialCartas();
    const nuevo = { email:(email||'').toLowerCase(), archivo:archivo||'', totalCartas:totalCartas||0, accion:accion||'zip', fecha:new Date().toISOString() };
    lista.unshift(nuevo);
    if (lista.length > HISTORIAL_CARTAS_MAX) lista.length = HISTORIAL_CARTAS_MAX;
    guardarHistorialCartas(lista); res.json(nuevo);
});

const TIPO_COLUMNA = { 'A':'activo','P':'pasivo','T':'pasivo','I':'ganancia','G':'perdida','C':'perdida','O':'orden' };
app.get('/reporte8/:empresa', async (req, res) => {
    const { empresa } = req.params;
    const { ano, mes } = req.query;
    if (!empresa||!EMPRESAS[empresa]) return res.status(400).json({ error: 'Empresa no válida' });
    if (!ano) return res.status(400).json({ error: 'Falta año' });
    const db = EMPRESAS[empresa];
    try {
        const pool    = await sql.connect(sqlConfig);
        const request = pool.request();
        request.input('ano', sql.VarChar, String(ano));
        let mesFilter = '';
        if (mes) {
            const meses = (Array.isArray(mes)?mes:[mes]).map(m=>m.trim()).filter(Boolean);
            const mesPlaceholders = meses.map((m,i)=>{ request.input(`mes${i}`,sql.VarChar,m.padStart(2,'0')); return `@mes${i}`; });
            mesFilter = `AND m.CpbMes IN (${mesPlaceholders.join(',')})`;
        }
        const anoNum = parseInt(ano);
        const query = `
            SELECT
                c.PCCODI   AS cuenta,
                c.PCDESC   AS descripcion,
                c.PCTIPO   AS tipo,
                c.PCNIVEL  AS nivel,
                ISNULL(SUM(m.MovDebe),  0) AS debe,
                ISNULL(SUM(m.MovHaber), 0) AS haber
            FROM [${db}].softland.cwpctas c
            LEFT JOIN [${db}].softland.cwmovim m
                ON m.PctCod = c.PCCODI
                AND (
                    (m.CpbAno = @ano ${mesFilter})
                    ${mes ? '' : `OR (CAST(m.CpbAno AS INT) < ${anoNum})`}
                )
            LEFT JOIN [${db}].softland.cwcpbte cp
                ON cp.CpbNum = m.CpbNum AND cp.CpbAno = m.CpbAno
            WHERE c.PCNIVEL = 3
              AND c.PCTIPO NOT IN ('O')
              AND (cp.CpbEst = 'V' OR m.CpbNum IS NULL)
              AND (m.CpbNum IS NULL OR m.CpbNum != '00000000')
            GROUP BY c.PCCODI, c.PCDESC, c.PCTIPO, c.PCNIVEL
            ORDER BY c.PCCODI
        `;
        const result = await request.query(query);
        await sql.close();
        const filas = result.recordset.map(row => {
            const debe=Number(row.debe)||0,haber=Number(row.haber)||0,saldo=debe-haber;
            const tipo=(row.tipo||'').trim(),col=TIPO_COLUMNA[tipo]||'activo';
            const deudor=saldo>0?saldo:0,acreedor=saldo<0?Math.abs(saldo):0;
            let activo=0,pasivo=0,perdida=0,ganancia=0;
            if(col==='activo'){if(saldo>=0)activo=saldo;else pasivo=Math.abs(saldo);}
            else if(col==='pasivo'){if(tipo==='T'){pasivo=saldo<=0?Math.abs(saldo):-saldo;}else{if(saldo<=0)pasivo=Math.abs(saldo);else activo=saldo;}}
            else if(col==='perdida'){if(saldo>=0)perdida=saldo;else ganancia=Math.abs(saldo);}
            else if(col==='ganancia'){if(saldo<=0)ganancia=Math.abs(saldo);else perdida=saldo;}
            return {cuenta:row.cuenta,descripcion:(row.descripcion||'').trim(),tipo,debe,haber,deudor,acreedor,activo,pasivo,perdida,ganancia};
        });
        const totales=filas.reduce((acc,f)=>{
            acc.debe+=f.debe;acc.haber+=f.haber;acc.deudor+=f.deudor;acc.acreedor+=f.acreedor;
            acc.activo+=f.activo;acc.pasivo+=f.pasivo;acc.perdida+=f.perdida;acc.ganancia+=f.ganancia;
            return acc;
        },{debe:0,haber:0,deudor:0,acreedor:0,activo:0,pasivo:0,perdida:0,ganancia:0});
        const resultadoEjercicio=totales.ganancia-totales.perdida;
        if(resultadoEjercicio>0)totales.pasivo+=resultadoEjercicio;
        else totales.activo+=resultadoEjercicio;
        totales.resultadoEjercicio=resultadoEjercicio;
        res.json({empresa,base_datos:db,ano,mes:mes||'todos',filas,totales});
    } catch(err) { console.error('Error reporte8:',err.message); await sql.close().catch(()=>{}); res.status(500).json({ error:err.message }); }
});

app.get('/sii/contribuyente/:rut', async (req, res) => {
    const rut=req.params.rut, apiKey=process.env.APIGATEWAY_TOKEN;
    if (!apiKey) return res.status(500).json({ error: 'APIGATEWAY_TOKEN no configurada en .env' });
    const hosts=['legacy.apigateway.cl','app.apigateway.cl'];
    const spath=`/api/v1/sii/contribuyentes/situacion_tributaria/tercero/${encodeURIComponent(rut)}`;
    for (const hostname of hosts) {
        try {
            const result = await new Promise((resolve,reject) => {
                const options={hostname,path:spath,method:'GET',headers:{'Authorization':`Token ${apiKey}`,'Accept':'application/json','Content-Type':'application/json'}};
                const reqHttp=https.request(options,r=>{let data='';r.on('data',c=>data+=c);r.on('end',()=>resolve({status:r.statusCode,body:data}));});
                reqHttp.on('error',reject);reqHttp.end();
            });
            console.log(`[SII] ${hostname} → ${result.status}`);
            if (result.status!==404) {
                let parsed;try{parsed=JSON.parse(result.body);}catch(e){parsed={raw:result.body};}
                if (result.status!==200) return res.status(result.status).json({error:'Error API Gateway',status:result.status,detalle:parsed});
                return res.json(parsed);
            }
        } catch(err){console.error(`[SII] Error con ${hostname}:`,err.message);}
    }
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

function merakiGet(mpath,apiKey) {
    return new Promise((resolve,reject)=>{
        const options={hostname:'api.meraki.com',path:`/api/v1${mpath}`,method:'GET',headers:{'X-Cisco-Meraki-API-Key':apiKey,'Accept':'application/json','Content-Type':'application/json'}};
        const req=https.request(options,res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(data)});}catch(e){resolve({status:res.statusCode,data});}});});
        req.on('error',reject);req.end();
    });
}
app.get('/meraki/status', async (req, res) => {
    const apiKey=process.env.MERAKI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'MERAKI_API_KEY no configurada en .env' });
    try {
        const orgs=await merakiGet('/organizations',apiKey);
        if (!orgs.data||!orgs.data.length) return res.status(404).json({ error: 'No se encontraron organizaciones' });
        const org=orgs.data[0],orgId=org.id;
        const nets=await merakiGet(`/organizations/${orgId}/networks`,apiKey);
        const devs=await merakiGet(`/organizations/${orgId}/devices/statuses`,apiKey);
        const dispositivos=(devs.data||[]).map(d=>({name:d.name,model:d.model,status:d.status,lanIp:d.lanIp,mac:d.mac}));
        const redAppliance=(nets.data||[]).find(n=>n.productTypes&&n.productTypes.includes('appliance'));
        let uplinkData=[],clientesTotal=null;
        if (redAppliance) {
            const uplink=await merakiGet(`/networks/${redAppliance.id}/appliance/uplinks/usageHistory`,apiKey);
            uplinkData=uplink.data||[];
            const clientes=await merakiGet(`/networks/${redAppliance.id}/clients?timespan=300`,apiKey);
            clientesTotal=Array.isArray(clientes.data)?clientes.data.length:null;
        }
        res.json({org:{id:orgId,name:org.name},red:redAppliance?{id:redAppliance.id,name:redAppliance.name}:null,dispositivos,uplinks:uplinkData,clientesActivos:clientesTotal,timestamp:new Date().toISOString()});
    } catch(err){console.error('Error Meraki:',err.message);res.status(500).json({error:err.message});}
});

// ════════════════════════════════════════════════════════════════
// ── CONVERTIR PDF → Office con LibreOffice ───────────────────
// POST /convert-pdf
// Form-data: file (.pdf), format (docx|xlsx|pptx|odt|ods|odp|html|txt)
// ════════════════════════════════════════════════════════════════
app.post('/convert-pdf', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PDF' });

    const format    = (req.body.format || 'docx').toLowerCase().trim();
    const validFmts = ['docx','xlsx','pptx','odt','ods','odp','html','txt'];

    if (!validFmts.includes(format)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: `Formato no soportado: ${format}. Válidos: ${validFmts.join(', ')}` });
    }

    const inputPath  = req.file.path;
    const outDir     = os.tmpdir();
    const outputPath = path.join(outDir, path.basename(inputPath) + '.' + format);
    const origName   = (req.file.originalname || 'documento').replace(/\.pdf$/i, '');
    const dlName     = origName + '_CONVERTIDO.' + format;

    console.log(`[ConvertPDF] ${req.file.originalname} → .${format}`);

    const cmd = `libreoffice --headless --convert-to ${format} --outdir "${outDir}" "${inputPath}"`;

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        fs.unlink(inputPath, () => {});

        if (error) {
            console.error('[ConvertPDF] Error LibreOffice:', stderr || error.message);
            fs.unlink(outputPath, () => {});
            return res.status(500).json({
                error: 'Error en la conversión. Verifica que el PDF no esté protegido con contraseña.',
                detalle: stderr || error.message
            });
        }

        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'LibreOffice no generó el archivo de salida.' });
        }

        res.download(outputPath, dlName, (err) => {
            fs.unlink(outputPath, () => {});
            if (err) console.error('[ConvertPDF] Error enviando archivo:', err.message);
        });
    });
});

app.get('/convert-pdf/status', (req, res) => {
    exec('libreoffice --version', (error, stdout) => {
        if (error) return res.json({ disponible: false, mensaje: 'LibreOffice no instalado' });
        res.json({ disponible: true, version: stdout.trim() });
    });
});

// ── Iniciar servidor ──────────────────────────────────────────
const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('  =======================================');
    console.log('   Baker API corriendo en puerto ' + PORT);
    console.log('   http://localhost:' + PORT + '/ping');
    console.log('  =======================================');
    console.log('');
});
