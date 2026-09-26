# tools/install — the owner's Civ 6 install, read as the source

The layered install (Base <- Expansion1 <- Expansion2 and the DLC packs a
Gathering Storm game loads, in modinfo order), parsed as the game builds its
database.

### `xml_check.py` — the constants against the install

    python tools/install/xml_check.py check --baseline docs/PROVENANCE.md

`Install` is the layered reader the other scripts import. `check` re-reads
every tagged constant of the exporter's `seeder/worlds/provenance.json` from
the install and compares; the battery runs it as its provenance ratchet
(`docs/PROVENANCE.md` holds the standing disagreements).

### `xml_modifiers.py` — the install's modifier ledger, both XML styles

    python tools/install/xml_modifiers.py MODIFIER_PLAYER_ADJUST_SPY_BONUS ...

Policies.xml and friends write modifier rows as child ELEMENTS, not
attributes; a line grep for `ModifierType="..."` returns nothing there and
reads as "no such modifier exists". This parses the XML and prints each
modifier's arguments and what attaches it.
