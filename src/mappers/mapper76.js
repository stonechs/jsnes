import Mapper0 from "./mapper0.js";

// Namcot 108 / mapper 76: switchable PRG and CHR banks.
class Mapper76 extends Mapper0 {
  static mapperName = "Namcot 108";

  loadROM() {
    super.loadROM();
    this.load8kRomBank(this.nes.rom.romCount * 2 - 2, 0xc000);
    this.load8kRomBank(this.nes.rom.romCount * 2 - 1, 0xe000);
    this.command = 0;
  }

  write(address, value) {
    if (address < 0x8000) return super.write(address, value);

    switch (address & 0xe001) {
      case 0x8000:
        this.command = value & 7;
        break;
      case 0x8001:
        if (this.command >= 6) {
          this.load8kRomBank(value, 0x8000 + (this.command - 6) * 0x2000);
        } else if (this.command >= 2) {
          this.load2kVromBank(value, (this.command - 2) * 0x0800);
        }
        break;
    }
  }
}

export default Mapper76;
