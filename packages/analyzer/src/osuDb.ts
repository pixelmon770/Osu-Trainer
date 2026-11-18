// Parser osu!.db (osu!stable) – lista wszystkich map w folderze Songs.
// Potrzebujemy z niego głównie: MD5 mapy → folder i nazwa pliku .osu,
// żeby replay od razu znalazł swoją mapę.
// Format: https://github.com/ppy/osu/wiki/Legacy-database-file-structure

export class OsuDbError extends Error {}

export interface OsuDbBeatmap {
  md5: string;
  /** folder w Songs */
  folderName: string;
  /** nazwa pliku .osu w tym folderze */
  osuFileName: string;
  artist: string;
  title: string;
  version: string;
  creator: string;
  /** ID poziomu trudności na osu.ppy.sh (0 = brak) */
  beatmapId: number;
  beatmapSetId: number;
  /** 0 = osu!, 1 = taiko, 2 = catch, 3 = mania */
  mode: number;
  circles: number;
  sliders: number;
  spinners: number;
  ar: number;
  cs: number;
  hp: number;
  od: number;
  /** gwiazdki bez modów (osu!standard), 0 jeśli osu! jeszcze ich nie policzył */
  stars: number;
  drainTimeS: number;
  totalTimeMs: number;
}

export interface OsuDb {
  version: number;
  folderCount: number;
  player: string;
  beatmaps: OsuDbBeatmap[];
}

const V_SINGLE_DIFFICULTY = 20140609;
const V_NO_ENTRY_SIZE = 20191106;

class Reader {
  pos = 0;
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  private readonly decoder = new TextDecoder();
  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  private need(n: number) {
    if (this.pos + n > this.buf.length) throw new OsuDbError('Plik osu!.db jest ucięty albo uszkodzony.');
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
  byte(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }
  bool(): boolean {
    return this.byte() !== 0;
  }
  short(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  int(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  single(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  double(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  string(): string {
    const marker = this.byte();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new OsuDbError(`Nieoczekiwany bajt ${marker} w osu!.db (pozycja ${this.pos - 1}).`);
    let len = 0;
    let shift = 0;
    for (;;) {
      const b = this.byte();
      len += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    this.need(len);
    const s = this.decoder.decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  /** pary (mody, gwiazdki); zwraca gwiazdki bez modów */
  starPairs(): number {
    const count = this.int();
    let noMod = 0;
    for (let i = 0; i < count; i++) {
      if (this.byte() !== 0x08) throw new OsuDbError('Nieprawidłowe dane gwiazdek w osu!.db.');
      const mods = this.int();
      const type = this.byte();
      // 0x0c = Float (od wersji 20250107), 0x0d = Double (starsze bazy)
      const stars = type === 0x0c ? this.single() : type === 0x0d ? this.double() : NaN;
      if (Number.isNaN(stars)) throw new OsuDbError('Nieprawidłowe dane gwiazdek w osu!.db.');
      if (mods === 0) noMod = stars;
    }
    return noMod;
  }
}

export function parseOsuDb(data: Uint8Array): OsuDb {
  const r = new Reader(data);
  const version = r.int();
  const folderCount = r.int();
  r.bool(); // konto odblokowane
  r.skip(8); // data odblokowania
  const player = r.string();
  const count = r.int();
  if (count < 0 || count > 5_000_000) throw new OsuDbError('Nieprawidłowa liczba map w osu!.db.');

  const beatmaps: OsuDbBeatmap[] = [];
  for (let i = 0; i < count; i++) {
    if (version < V_NO_ENTRY_SIZE) r.int(); // rozmiar wpisu (starsze bazy)
    const artist = r.string();
    r.string(); // artysta (Unicode)
    const title = r.string();
    r.string(); // tytuł (Unicode)
    const creator = r.string();
    const diffName = r.string();
    r.string(); // plik audio
    const md5 = r.string();
    const osuFileName = r.string();
    r.byte(); // status rankingu
    const circles = r.short();
    const sliders = r.short();
    const spinners = r.short();
    r.skip(8); // data modyfikacji
    const diff = () => (version < V_SINGLE_DIFFICULTY ? r.byte() : r.single());
    const ar = diff();
    const cs = diff();
    const hp = diff();
    const od = diff();
    r.double(); // prędkość sliderów
    let stars = 0;
    if (version >= V_SINGLE_DIFFICULTY) {
      stars = r.starPairs(); // osu!standard
      r.starPairs(); // taiko
      r.starPairs(); // catch
      r.starPairs(); // mania
    }
    const drainTimeS = r.int();
    const totalTimeMs = r.int();
    r.int(); // początek podglądu
    const timingPoints = r.int();
    if (timingPoints < 0) throw new OsuDbError('Nieprawidłowe punkty czasowe w osu!.db.');
    r.skip(timingPoints * 17);
    const beatmapId = r.int();
    const beatmapSetId = r.int();
    r.int(); // wątek na forum
    r.skip(4); // oceny w 4 trybach
    r.short(); // lokalny offset
    r.single(); // stack leniency
    const mode = r.byte();
    r.string(); // źródło
    r.string(); // tagi
    r.short(); // offset online
    r.string(); // czcionka tytułu
    r.bool(); // niegrana
    r.skip(8); // ostatnio grana
    r.bool(); // osz2
    const folderName = r.string();
    r.skip(8); // ostatnie sprawdzenie
    r.skip(5); // ignoruj dźwięki/skórkę, wyłącz storyboard/wideo, visual override
    if (version < V_SINGLE_DIFFICULTY) r.short();
    r.int(); // data modyfikacji (?)
    r.byte(); // prędkość przewijania mania

    beatmaps.push({
      md5,
      folderName,
      osuFileName,
      artist,
      title,
      version: diffName,
      creator,
      beatmapId,
      beatmapSetId,
      mode,
      circles,
      sliders,
      spinners,
      ar,
      cs,
      hp,
      od,
      stars,
      drainTimeS,
      totalTimeMs
    });
  }

  return { version, folderCount, player, beatmaps };
}
