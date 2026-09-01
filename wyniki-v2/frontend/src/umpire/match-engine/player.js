/**
 * Port of android Player (`data/model/Player.kt`).
 */
export class Player {
  constructor({
    id,
    name,
    firstName = '',
    lastName = '',
    flag = null,
    flagUrl = null,
    group = null,
    gender = null,
    list = null,
    partner = null,
  }) {
    this.id = id;
    this.name = name;
    this.firstName = firstName;
    this.lastName = lastName;
    this.flag = flag;
    this.flagUrl = flagUrl;
    this.group = group;
    this.gender = gender;
    this.list = list;
    this.partner = partner;
  }

  getDisplayName() {
    return this.lastName || this.name;
  }

  getFullName() {
    const full = `${this.firstName} ${this.lastName}`.trim();
    return full || this.name;
  }

  getGenderShortLabel() {
    const gender = this.gender?.trim()?.toUpperCase();
    if (gender === 'F') return 'K';
    if (gender === 'M') return 'M';
    return null;
  }

  copy(overrides = {}) {
    return new Player({
      id: this.id,
      name: this.name,
      firstName: this.firstName,
      lastName: this.lastName,
      flag: this.flag,
      flagUrl: this.flagUrl,
      group: this.group,
      gender: this.gender,
      list: this.list,
      partner: this.partner,
      ...overrides,
    });
  }
}
