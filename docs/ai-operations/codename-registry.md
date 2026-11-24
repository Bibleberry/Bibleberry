# Bibleberry Codename Registry

This is the sole authoritative inventory and allocation procedure for new codenamed GitHub Issues. It takes effect when the PR establishing it merges into `main`. Every department applies it to each authorized new codenamed Issue, including engineering candidates and administrative, governance, documentation, and maintenance assignments. The [AI Development Protocol §2B](../ai-development-protocol.md#2b-assignment-identity-issue-creation--handoff-all-departments) and the departmental charters govern who may create an Issue.

## Allocation procedure

1. **Read the accepted registry.** Use the version on `main`. Select only from the entries below.
2. **Recover the rotation position.** In live repository Issues, including closed Issues, find the latest registry allocation by original Issue creation order (newest created first, using the higher Issue number to break a timestamp tie). Exclude PR records. A registry allocation has a standalone `Codename registry sequence: NNN` line in its Issue body, with a sequence that matches its title codename in this registry. Issues created before this procedure took effect remain historical. Begin immediately after the latest allocation, or at 001 if there has been none. If an allocation marker is ambiguous or inconsistent, reconcile it with Planning before proceeding.
3. **Check availability.** Inspect all open repository Issues and PRs, including Draft PRs and open PRs whose originating Issues are closed. Read their established assignment codenames, normally the bracketed title prefix. Use the originating Issue to resolve an open PR's assignment identity where needed. Compare each of the proposed words against both words of each active assignment codename, case-insensitively and regardless of position. Restrict the comparison to codename words. If either word matches, the entry is temporarily unavailable.
4. **Skip and wrap.** Advance immediately past an unavailable entry and continue in sequence, wrapping from 100 to 001. Consider each entry at most once per traversal. Skipped entries are eligible again when encountered on a subsequent rotation. After checking all 100 entries without finding an available one, stop and report the condition to Aaron.
5. **Create and verify the Issue.** Use the selected codename in the title and record the three-digit sequence on its own line in the Issue body. Verify that GitHub created the intended Issue with the correct number, title, and metadata before releasing the allocation to the next creator. If creation fails or its outcome is uncertain, reconcile the live GitHub state before another attempt or allocation. Start each subsequent allocation after the most recently verified registry Issue.

   Example Issue title: `[Hollow Belfry] Implement the approved reader preference behavior`

   Example Issue body metadata: `Codename registry sequence: 016`

For example, after allocating 014 Marble Viaduct, skip 015 Twilight Beacon if Cloud Beacon remains open. If 016 Hollow Belfry is available, allocate it and start the next allocation at 017.

## Ownership and coordination

Engineering Issue Planning is the operational custodian. Departments retain their existing authority to create Issues within their respective authorized scopes. When concurrent allocation is possible, coordinate through Planning so one authorized creator at a time reads the rotation position, checks availability, creates the Issue and verifies the result. The live check and creation are one serialized operational action. If coordination cannot be established, stop and obtain it before creating the Issue.

GitHub Issues provide the allocation history, rotation position, and assignment identity. The inventory stays fixed, with routine allocations recorded only on their Issues. Keep availability and skipped entries out of the registry.

## Recycling and assignment identity

Each codename and both of its individual words must be unique among active assignments. A previously used codename may be recycled after its prior originating Issue and all associated PRs are closed, subject to the same availability check. The recycled codename identifies a new assignment when paired with its new originating Issue number.

Keep each assignment's original codename across its lifecycle, including corrections, replacement PRs, and changes of agent, department, reviewer, or conversation. Historical Issues, PRs, and branches retain their names. Existing overlaps are grandfathered until those assignments close. If reopening a historical assignment would introduce an active naming collision, refer the conflict to Aaron before resuming implementation.

Formal handoffs pair the codename with its originating Issue number and link, relevant PR numbers, and applicable verified SHAs. Follow the [common handoff standard](handoff-standard.md).

## Fixed inventory

| Sequence | Codename |
|---|---|
| 001 | Obsidian Falcon |
| 002 | Bronze Galleon |
| 003 | Coastal Osprey |
| 004 | Frigid Cascade |
| 005 | Radiant Eclipse |
| 006 | Nomadic Vortex |
| 007 | Arctic Sextant |
| 008 | Saffron Pavilion |
| 009 | Drifting Comet |
| 010 | Tidal Marlin |
| 011 | Distant Horizon |
| 012 | Harmonic Ballad |
| 013 | Silent Observatory |
| 014 | Marble Viaduct |
| 015 | Twilight Beacon |
| 016 | Hollow Belfry |
| 017 | Ancient Codex |
| 018 | Resolute Banyan |
| 019 | Crimson Badger |
| 020 | Jade Pagoda |
| 021 | Stellar Prism |
| 022 | Forged Bellows |
| 023 | Noble Condor |
| 024 | Flint Scroll |
| 025 | Sterling Avalanche |
| 026 | Basalt Canyon |
| 027 | Sylvan Stag |
| 028 | Vivid Aurora |
| 029 | Agile Gazelle |
| 030 | Silver Locket |
| 031 | Granite Sparrow |
| 032 | Sapphire Nebula |
| 033 | Desert Mirage |
| 034 | Braided Spindle |
| 035 | Steady Bison |
| 036 | Maroon Fresco |
| 037 | Cobalt Lighthouse |
| 038 | Mahogany Cello |
| 039 | Verdant Estuary |
| 040 | Frosted Lotus |
| 041 | Cedar Harp |
| 042 | Brass Pendulum |
| 043 | Cinder Parchment |
| 044 | Solar Caliper |
| 045 | Misty Plateau |
| 046 | Polished Scepter |
| 047 | Juniper Meadow |
| 048 | Violet Quill |
| 049 | Slate Citadel |
| 050 | Boreal Sequoia |
| 051 | Crisp Fox |
| 052 | Luminous Pulsar |
| 053 | Aspen Summit |
| 054 | Velvet Anvil |
| 055 | Pearl Lagoon |
| 056 | Rugged Bastion |
| 057 | Arid Obelisk |
| 058 | Solemn Colonnade |
| 059 | Kinetic Meteor |
| 060 | Copper Magnolia |
| 061 | Pewter Sundial |
| 062 | Autumn Cloister |
| 063 | Volcanic Foundry |
| 064 | Hidden Atoll |
| 065 | Vigilant Chronicle |
| 066 | Amber Compass |
| 067 | Garnet Puma |
| 068 | Midnight Raven |
| 069 | Woven Thistle |
| 070 | Rustic Loom |
| 071 | Coral Mosaic |
| 072 | Lunar Cathedral |
| 073 | Quartz Barometer |
| 074 | Polar Glacier |
| 075 | Carved Portico |
| 076 | Regal Crane |
| 077 | Iron Bracken |
| 078 | Indigo Telescope |
| 079 | Alabaster Rotunda |
| 080 | Maritime Lantern |
| 081 | Burnished Chalice |
| 082 | Swift Kingfisher |
| 083 | Golden Acacia |
| 084 | Emerald Tapestry |
| 085 | Terracotta Aqueduct |
| 086 | Monsoon Archipelago |
| 087 | Tempered Chisel |
| 088 | Bold Panther |
| 089 | Azure Clover |
| 090 | Ivory Astrolabe |
| 091 | Porcelain Orchid |
| 092 | Equinox Spire |
| 093 | Birch Wren |
| 094 | Etched Medallion |
| 095 | Teal Fern |
| 096 | Scarlet Heron |
| 097 | Alpine Otter |
| 098 | Stark Caldera |
| 099 | Weathered Rampart |
| 100 | Laurel Sonnet |
