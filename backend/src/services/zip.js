const zlib = require('zlib');

// Empacotador ZIP minimo (um arquivo por zip), sem depender de biblioteca
// externa. Existe porque o Brevo recusa anexo .gz cru ("Unsupported file
// format"), mas aceita .zip — formato bem mais reconhecido por provedores
// de e-mail. Implementa so o suficiente do formato ZIP para um entry
// comprimido com DEFLATE, seguindo a especificacao PKZIP (APPNOTE.TXT).

// CRC32 por tabela pre-computada — nao depende de zlib.crc32, que so existe
// em versoes recentes do Node e o ambiente de producao pode nao ter.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Data/hora no formato DOS que o ZIP exige (16 bits cada). Nao precisa ser
// exata — so entra no cabecalho, nenhum leitor de zip rejeita por isso.
function dosDateTime(date) {
  const dosTime = ((date.getHours() & 0x1F) << 11)
    | ((date.getMinutes() & 0x3F) << 5)
    | ((date.getSeconds() >> 1) & 0x1F);
  const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9)
    | (((date.getMonth() + 1) & 0x0F) << 5)
    | (date.getDate() & 0x1F);
  return { dosTime, dosDate };
}

// Empacota um unico arquivo num .zip valido (metodo DEFLATE). Retorna Buffer.
function zipSingleFile(filename, content) {
  const nameBuf = Buffer.from(filename, 'utf8');
  const compressed = zlib.deflateRawSync(content, { level: 9 });
  const crc = crc32(content);
  const { dosTime, dosDate } = dosDateTime(new Date());

  // Cabecalho local (30 bytes fixos + nome do arquivo)
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);  // assinatura
  localHeader.writeUInt16LE(20, 4);          // versao minima (2.0)
  localHeader.writeUInt16LE(0, 6);           // flags
  localHeader.writeUInt16LE(8, 8);           // metodo: 8 = deflate
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);          // extra field length

  // Cabecalho do diretorio central (46 bytes fixos + nome do arquivo)
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);        // versao de quem criou
  centralHeader.writeUInt16LE(20, 6);        // versao minima
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);        // extra field length
  centralHeader.writeUInt16LE(0, 32);        // comment length
  centralHeader.writeUInt16LE(0, 34);        // disco inicial
  centralHeader.writeUInt16LE(0, 36);        // atributos internos
  centralHeader.writeUInt32LE(0, 38);        // atributos externos
  centralHeader.writeUInt32LE(0, 42);        // offset do cabecalho local

  // Fim do diretorio central (22 bytes fixos)
  const centralSize = centralHeader.length + nameBuf.length;
  const localSize = localHeader.length + nameBuf.length + compressed.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);                  // entradas neste disco
  eocd.writeUInt16LE(1, 10);                 // total de entradas
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(localSize, 16);         // offset do diretorio central
  eocd.writeUInt16LE(0, 20);                 // comment length

  return Buffer.concat([
    localHeader, nameBuf, compressed,
    centralHeader, nameBuf,
    eocd,
  ]);
}

module.exports = { zipSingleFile, crc32 };
