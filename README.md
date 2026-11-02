# Capitalism

A browser strategy game about the oil century, built as a tribute to Molleindustria's
*Oiligarchy* (2008). You take over an oil company in 1946 with one pump in Texas, and one number
decides your career: **national demand**. The red line on the right of the screen is what the
country wants this year; the bar under it is what you pump. Stay level with it, or the board
finds somebody hungrier.

Plays on iPhone, iPad and desktop. No dependencies, no build step, installs as a PWA, works
offline.

**Play:** https://apxaiconsulting.github.io/capitalism/

## What you do

The screen is a cutaway: sky and hills on top, and the earth underneath with black pools in it.

- **ACTIONS** gives you a crew or a rig. Pick one, then tap the ground.
  - An **exploration crew** surveys a stretch of land and shows you the pools under it.
  - An **oil derrick** drills straight down. If a pool is under it, it pumps. If not, you have
    bought a hole.
  - **Offshore rigs** for the water, **mercenaries** to keep the locals away from the wellheads,
    and after the peak, a **human burner**, which needs no pool at all and whose feedstock
    appendix nobody on the committee requests.
- Pools run dry, and the flow falls away once a pool is half empty. That is the peak in
  miniature, and it happens to the whole world too, about halfway through the century.
- **The globe** travels: Texas, the Kuvik Refuge in Alaska, Rio Verde in Venezuela, the Okun
  Delta in Nigeria, Al-Dhahir in Iraq, and a sea of methane on Titan.
- **Washington** is a place you visit. Ten representatives decide your laws: oiled ones vote your
  way, green ones never do, gray ones flip a coin, and six votes carry a bill. You can buy the
  gray ones. Every ten years there is an election: fund a runner, and fund the winner enough that
  the presidency comes out **oiled**, which opens the room below the White House. Wars are
  arranged there, and Al-Dhahir opens no other way: arm the regime, break its economy, wait for
  the invasion, then liberate it.
- Pro-oil laws raise the country's **addiction**, which raises demand, which is both your market
  and your sentence.

## The endings

Fired. Mutually Assured Destruction, at three hundred dollars a barrel. Retirement, if the
country learns to want less of what you sell. Farewell West, if the economy you fed collapses.
One Trillion Dollars. Ligeia Mare. And The Oil Century, if you are still in the chair in 2051.

## Running it

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Nothing to install or compile. For GitHub Pages, serve the
repository root from the default branch.

## Credits

**Capitalism** is an original game. The demand line, the oiled Congress, the room below the White
House and the human burners are *Oiligarchy*'s ideas, followed on purpose. No code or art from
that game is used here, and every place, politician and company is fictional.

Vanilla JavaScript, one canvas, no libraries.
