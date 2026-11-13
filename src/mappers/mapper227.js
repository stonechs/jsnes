import Mapper0 from "./mapper0.js";

// Mapper 227 is a multicart board selected through CPU address-line decoding.
class Mapper227 extends Mapper0 {
  static mapperName = "76-in-1 multicart";

  loadROM() {
    super.loadROM();
    const rom = this.nes.rom;
    this.variant = rom.isNES2 ? rom.header[8] >>> 4 : rom.batteryRam ? 0 : 1;
    this.write(0x8000, 0);
  }

  write(address, value) {
    if (address < 0x8000) return super.write(address, value);

    this.latch = address;
    const selected = ((address >>> 2) & 31) | ((address >>> 3) & 32);
    const lower = address & 1 ? selected & ~1 : selected;
    let upper = address & 1 ? selected | 1 : selected;
    if (!(address & 0x80)) {
      upper = address & 0x200
        ? selected | 7
        : selected & (this.variant === 2 ? 32 : 56);
    }
    this.loadRomBank(lower, 0x8000);
    this.loadRomBank(upper, 0xc000);
    this.nes.ppu.setMirroring(
      address & 2
        ? this.nes.rom.HORIZONTAL_MIRRORING
        : this.nes.rom.VERTICAL_MIRRORING,
    );
  }

  load(address) {
    if (address >= 0x8000 && this.variant === 1 && (this.latch & 0x400)) {
      address &= ~15;
    }
    return super.load(address);
  }

  canWriteChr() {
    return !this.variant || !(this.latch & 0x80);
  }
}

export default Mapper227;
