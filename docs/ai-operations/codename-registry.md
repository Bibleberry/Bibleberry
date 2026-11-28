# Bibleberry Codename Registry

This is the sole authoritative inventory and allocation procedure for new codenamed GitHub Issues. It takes effect when the PR establishing it merges into `main`. Every department applies it to each authorized new codenamed Issue, including engineering candidates and administrative, governance, documentation, and maintenance assignments. The [AI Development Protocol §2B](../ai-development-protocol.md#2b-assignment-identity-issue-creation--handoff-all-departments) and the departmental charters govern who may create an Issue.

## Allocation procedure

1. **Read the accepted registry.** Use the version on `main`. Select only from the entries below.
2. **Recover the rotation position.** Across live Bibleberry organization Issues, including closed Issues, find the latest registry allocation by original Issue creation order (newest created first, using repository full name in ascending order and then Issue number in descending order to break a timestamp tie). Exclude PR records. A registry allocation has a standalone `Codename registry sequence: NNN` line in its Issue body, with a sequence that matches its title codename in this registry. Issues created before this procedure took effect remain historical. Begin immediately after the latest allocation, or at 001 if there has been none. Skip malformed or mismatched markers, use the newest valid allocation and send the anomalous Issue link and observed marker to Planning for reconciliation. If relevant live records cannot be read, pause and report the access gap to the responsible repository maintainer.
3. **Check availability.** Inspect all open Issues and PRs across Bibleberry organization repositories, including Draft PRs and open PRs whose originating Issues are closed. Read their established assignment codenames, normally the bracketed title prefix. Use the originating Issue to resolve an open PR's assignment identity where needed. Compare each of the proposed words against both words of each active assignment codename, case-insensitively and regardless of position. Restrict the comparison to codename words. If either word matches, the entry is temporarily unavailable.
4. **Skip and wrap.** Advance immediately past an unavailable entry and continue in sequence, wrapping from 100 to 001. Consider each entry at most once per traversal. Skipped entries are eligible again when encountered on a subsequent rotation. After checking all 100 entries without finding an available one, stop and report the condition to Aaron.
5. **Create and verify the Issue.** Recheck availability immediately before submission. Use the selected codename in the title and record the three-digit sequence on its own line in the Issue body. Read back the live repository, Issue number, URL, title and sequence. Check for a concurrent collision and refer any conflict to Planning with both Issue links. Issue creation and verification belong to the authorized creator. If creation fails or its outcome is uncertain, reconcile the live GitHub state before another attempt or allocation. Start each subsequent allocation after the most recently verified registry Issue.

   Example Issue title: `[Hollow Belfry] Implement the approved reader preference behavior`

   Example Issue body metadata: `Codename registry sequence: 016`

For example, after allocating 014 Marble Viaduct, skip 015 Twilight Beacon if Cloud Beacon remains open. If 016 Hollow Belfry is available, allocate it and start the next allocation at 017.

## Ownership and reconciliation

Each authorized Issue creator selects, creates and verifies the allocation directly. Planning permission, reservation, serialization and a separate allocation handoff are unnecessary. The department's existing Issue-creation authorization and scope still govern.

Engineering Issue Planning independently monitors Issue creation records across participating repositories and checks for sequence anomalies and active word collisions. Review anomalous markers against the Issue creation order and registry entries. Confirm an author's intent before requesting correction of allocation metadata, with the original record and correction documented on the Issue. A repeated sequence after legitimate recycling or a skipped unavailable name needs no correction.

If concurrent allocations collide, designate the valid Issue created first (break a timestamp tie by repository full name and then lowest Issue number) as the reference allocation for the collision. Keep the existing Issue titles, codenames and associated references. Planning records both Issue links, the canonical Issue identity of each assignment and the reason for the overlap in the affected Issues, and asks the responsible departments to use the repository-qualified Issue links in all handoffs. Treat both names and their constituent words as unavailable for new allocations while either colliding assignment is active. Resolve duplicate work through the ordinary scope and ownership process. Route only a substantive scope or authority dispute through the existing owner decision path. Routine naming reconciliation belongs to Planning.

Planning also applies this reconciliation when a historical Issue reopens with an active overlap. Before resuming work, confirm the exact originating Issue, assignment scope and authorization with the responsible department.

GitHub Issues provide the allocation history, rotation position, and assignment identity. The inventory stays fixed, with routine allocations recorded only on their Issues. Keep availability and skipped entries out of the registry.

## Recycling and assignment identity

Select new allocations whose codename and both words are unique among active assignments. Preserve established identities when an overlap is discovered after creation. A previously used codename may be recycled after its prior originating Issue and all associated PRs are closed, subject to the same availability check. The recycled codename identifies a new assignment when paired with its new originating Issue number.

Keep each assignment's original codename across its lifecycle, including corrections, replacement PRs, and changes of agent, department, reviewer, or conversation. Historical Issues, PRs, and branches retain their names. Existing overlaps are grandfathered until those assignments close.

Formal handoffs pair the codename with its originating repository, Issue number and link, relevant PR numbers, and applicable verified SHAs. Follow the [common handoff standard](handoff-standard.md).

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
