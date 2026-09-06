/* TB TOOL DATA — Rise of the Empire (placeholder structure).
   Fill this in with the real map: rename sectors/planets/missions and
   add recommended teams. No code changes needed — tb-tool.js renders
   whatever is defined here.

   Shape:
     TB_TOOL_DATA = {
       <tbId>: {
         id, name, description, image,
         map: { cols, rows, sectors: [
           { id, name, background, planet: null | planetId }
         ]},
         planets: {
           <planetId>: {
             id, name, image, briefing,
             missions: [
               { id, name, type, x, y, image, teams: [ team ] }
             ]
           }
         }
       }
     }

   - image/background paths are relative to the site root, no leading
     slash (e.g. 'assets/img/tb/rise-of-the-empire.png'). Any of them
     may be null — the tool falls back to styled placeholders, so add
     art gradually without breaking the page.
   - sectors.length should equal cols * rows; order is left-to-right,
     top-to-bottom. A sector with planet: null renders empty.
   - mission x/y are optional percentages (0-100) positioning the node
     on the planet map. Omit them and nodes auto-layout in a row.
   - mission type is a free label: 'Combat', 'Special', 'Platoon', ...
   - A SWGOH team is exactly 5 units. team = { name, members (5),
     notes, req } — every field is optional except name, but a team
     with members must list all 5. Example:
       { name: 'Example comp', members: ['Leader', 'Attacker', 'Support', 'Tank', 'Flex'], req: 'Relic 7+', notes: 'Open with mass assist.' }
   - teams: [] renders a "coming soon" empty state. */

const TB_TOOL_DATA = {
  rote: {
    id: 'rote',
    name: 'Rise of the Empire',
    description: 'TODO: one-line description of this battle — phases, special rules, what the guild should know.',
    image: 'assets/img/tb/rise-of-the-empire.png',
    map: {
      cols: 3,
      rows: 2,
      sectors: [
        { id: 'rote-s1', name: 'Sector 1', background: null, planet: 'rote-p1' },
        { id: 'rote-s2', name: 'Sector 2', background: null, planet: null },
        { id: 'rote-s3', name: 'Sector 3', background: null, planet: 'rote-p2' },
        { id: 'rote-s4', name: 'Sector 4', background: null, planet: null },
        { id: 'rote-s5', name: 'Sector 5', background: null, planet: 'rote-p3' },
        { id: 'rote-s6', name: 'Sector 6', background: null, planet: null },
      ],
    },
    planets: {
      'rote-p1': {
        id: 'rote-p1',
        name: 'Planet Alpha',
        image: null,
        briefing: 'TODO: one-line briefing for this planet.',
        missions: [
          { id: 'rote-p1-m1', name: 'Combat Mission 1', type: 'Combat', image: null, teams: [] },
          { id: 'rote-p1-m2', name: 'Special Mission 1', type: 'Special', image: null, teams: [] },
        ],
      },
      'rote-p2': {
        id: 'rote-p2',
        name: 'Planet Beta',
        image: null,
        briefing: 'TODO: one-line briefing for this planet.',
        missions: [
          { id: 'rote-p2-m1', name: 'Combat Mission 1', type: 'Combat', image: null, teams: [] },
          { id: 'rote-p2-m2', name: 'Combat Mission 2', type: 'Combat', image: null, teams: [] },
          { id: 'rote-p2-m3', name: 'Special Mission 1', type: 'Special', image: null, teams: [] },
        ],
      },
      'rote-p3': {
        id: 'rote-p3',
        name: 'Planet Gamma',
        image: null,
        briefing: 'TODO: one-line briefing for this planet.',
        missions: [
          { id: 'rote-p3-m1', name: 'Combat Mission 1', type: 'Combat', x: 22, y: 60, image: null, teams: [] },
          { id: 'rote-p3-m2', name: 'Special Mission 1', type: 'Special', image: null, teams: [] },
        ],
      },
    },
  },
};
