# Capitalism

A browser strategy game about the oil century. You take over a private oil major in 1946 with
one derrick in Texas, and the only number that matters is **national demand**: the red line on
the gauge is what the country wants this year, the bar is what you can pump. Stay at or above
the line, or the board finds someone hungrier.

Plays on iPhone, iPad and desktop. No dependencies, no build step, works offline, installable
as a PWA.

**Play:** https://apxaiconsulting.github.io/capitalism/

## The loop

- **Field.** Each region is a map you cannot see into. Send an **exploration crew** to scan a
  patch, then drill what it finds. Every field follows a Hubbert curve: flow decays once the
  reservoir is half empty. Fracking brings dead fields back at half strength.
- **World.** Demand is the economy multiplied by the country's **oil addiction**. You sell what
  the country wants; anything above that goes to storage and then gets dumped at a discount,
  which erodes the price. Anything below triggers a supply crisis.
- **Capitol.** Ten representatives: **oiled** ones always vote your way, **green** ones never
  do, gray ones flip a coin. Six votes carry a bill. Buying seats raises scandal, and every
  election loosens about a third of them.
- **Elections every ten years.** Fund a party's runner during the race. Give the winner enough
  and the administration is **oiled**, which opens the room below the White House: the Iraq
  invasion runs through "The Enemy Of My Enemy" and "Messing Up Their Economy" before Desert
  Storm, or through the dossier after a major attack. Coups, blockade clearances and discredited
  scientists are arranged in the same room.
- **HQ.** Addiction programmes - light trucks, streetcar acquisition, cheap aviation, plastics,
  manufactured doubt - permanently raise what the country needs. They raise your revenue and
  your sentence at the same time.
- **R&D.** Five branches over five decades: sonar and deepwater, fracking and automation,
  K Street and media holdings, counsel and tax structures, and a Futures branch that ends with
  orbital logistics and a methane lake on Titan.

## Nine regions

Texas, the Kuvik Refuge in Alaska (needs an act of Congress), Rio Verde in Venezuela (land, sea
and a nationalisation bill that keeps coming back), the Okun Delta in Nigeria (cheap concessions,
blockades that start peaceful and do not stay that way), Al-Dhahir in Iraq (closed until a war
opens it), plus the Gulf Shelf, the Caspian Basin, the Weddell Shelf in Antarctica, and Ligeia
Mare on Titan.

## Nine endings

Fired, Mutually Assured Destruction at $300 a barrel, Retirement when the country finally needs
less than a quarter of what it used to, Farewell West when the economy you fed collapses,
Indicted, One Trillion Dollars, The Pivot, Ligeia Mare, and The Oil Century if you are still in
the chair in 2051.

## Running it

Any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. There is nothing to install or compile. For GitHub Pages,
serve the repository root from the default branch.

## Credits

Capitalism is an original game, written as a much larger tribute to **Oiligarchy** (2008) by
**Molleindustria** (Paolo Pedercini), whose design - the demand line, the oiled Congress, the
room below the White House, the human burners after the peak - this follows deliberately and
expands on. No code or art from that game is used here, and all regions, politicians and
companies are fictional.

Vanilla JavaScript, one canvas, no libraries.
