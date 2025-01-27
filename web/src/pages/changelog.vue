<template>
  <v-container max-width="1200">
    <v-row>
      <v-col cols="12">
        <h1>Change Log</h1>
        <p>
          This is a list of changes made to the site. It is not exhaustive, but it should give you a good idea of what has been added or changed.
        </p>
        <p>Key:</p>
        <ul>
          <li>🆕: New Feature</li>
          <li>👍: Improvement</li>
          <li>🔧: Fixes</li>
        </ul>
        <v-divider />
        <h1>Alpha v0.4</h1>

        <p>Check out what's new in the video below!</p>
        <v-responsive :aspect-ratio="16 / 9" class="pb-4">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            frameborder="0"
            height="100%"
            referrerpolicy="strict-origin-when-cross-origin"
            src="https://www.youtube.com/embed/xiE7AwfzOpc?si=O0WvISqiPUPKFpCT"
            title="YouTube video player"
            width="100%"
          />
        </v-responsive>

        <h3><a href="https://github.com/orgs/satisfactory-factories/projects/2/views/1?filterQuery=+milestone%3A%22Alpha+4%22+&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=Title">Click here</a> for an itemised list of changes on GitHub!</h3>

        <p>There was a strong emphasis of planner stability in this update, addressing long running bugs and adding measures to prevent Planner breakages.  We managed to squish over <b>20 bugs</b>! 🐞 Many quality of life changes were added as well.</p>

        <h2>🆕 Export Calculator v2</h2>
        <v-img
          alt="Export Calculator"
          max-width="1200"
          src="/assets/changelog/alpha4/export-calculator.png"
        />
        <p>The export calculator has returned to its former glory and better than ever. It now accounts for multiple transport types:</p>
        <ul>
          <li>Trains (solids &amp; fluids)</li>
          <li>Drones (solids only)</li>
          <li>Trucks (solids only)</li>
          <li>Tractors (solids only)</li>
        </ul>
        <p>If the user attempt to transport a fluid with a transport method, they'll be told to turn it into the packaged version first. I've added timer buttons to the "drivable" transport methods which means you can ride the route, start the timer, and stop it and it'll automatically update the calculator. The calculator also shows the accuracy of each transport method, listing full assumptions  and potential caveats of each method.</p>

        <v-divider class="subsection" />

        <h2>🆕 Loading Sequence</h2>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/loading.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <p>
          The way that factory plans are loaded has been completely redesigned. It now loads each factory in sequence performing checks / validation as it goes to prevent possible plan corruption, and also shows to the user how far along in the loading process it is. Whereas before, if you loaded a large plan, it would just appear to freeze for what could be 30 or so seconds at a time for very big plans. Now the user is given feedback on what's happening at every step of the way.
        </p>

        <v-divider class="subsection" />

        <h2><i class="fas fa-conveyor-belt-alt" /><span class="ml-3">Products</span> section changes</h2>
        <p>The products section has been improved in a variety of ways:
        </p>
        <ul>
          <li>🆕 Product <b>ingredients</b> and <b>buildings</b> can now have their values changed, so if you have say Cables, you can adjust the Wire ingredient and scale the output of Cables appropriately.</li>
        </ul>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/ingredients.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <ul>
          <li>👍 <b>Internal byproducts are taken into account better</b>, where if it creates a product and also creates a byproduct of the same type (e.g. Sulphuric Acid created both as a product and as a byproduct of Encased Uranium Cells) it will no longer show a TRIM button for that product.</li>
          <li>🔧 <b>"FIX PRODUCTION" double buttons has now been removed</b>, and it has been replaced with a proper "Satisfy / Trim" buttons which takes into account more scenarios, including internal requirements and exports.</li>
        </ul>

        <v-divider class="subsection" />

        <h2><i class="fas fa-arrow-to-right" /><span class="ml-3">Imports</span> section improvements</h2>
        <p>Large overhaul of the way factories are chosen as import candidates and fixes to various helper buttons.</p>

        <ul>
          <li>
            👍 <b>Import candidate changes</b>: The way that the Import section was choosing candidates for the factories to import from has been completely re-written. The choice of candidates now more strongly considers the destination factory's requirements, including byproducts. This is a huge improvement over the previous system which had a number of edge cases where it would or wouldn't show a factory or would show factories which weren't relevant (e.g. Water imports showing for no reason).
          </li>
          <li>👍🔧 <b>TRIM and SATISFY buttons now take into account other imports of the same part</b>. Before, it would only check the import being trimmed / satisfied against the factory shortage / overflow, now it takes all other imports and calculates the difference.</li>
          <li>🔧 Imports no longer consider a factory a candidate if the source factory imports a raw resource which the destination factory needs.</li>
          <li>🆕 Redundant imports (where a singular import can handle the demands) are now highlighted with <v-chip class="sf-chip small orange ma-0">
            <i class="fas fa-exclamation-triangle" />
            <span class="ml-2">Redundant!</span>
          </v-chip>. This way this mostly works is to not require re-balancing of imports, and if one import can do the job the others are marked as redundant.
          </li>
          <li>🆕 Imports with no amount set are marked with <v-chip class="sf-chip small red ma-0">
            <i class="fas fa-exclamation-triangle" />
            <span class="ml-2">No amount set!</span>
          </v-chip>.
          </li>
          <li>🔧 TRIM button no longer shows when an import is also a byproduct in the factory.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 Satisfaction section improvements and fixes</h2>
        <p>Satisfaction section got a major set of QoL improvements in this update, in particular surrounding handling of Nuclear Waste products.</p>
        <ul>
          <li>👍 <b>Uranium / Plutonium waste handling</b> - The way the waste was being handled before was sub-optimal. The user had to figure out that in order to create the waste they needed to create a power plant. It was also erroneously possible to select Uranium Waste as a product, with no recipe (and a bug). Now, the user can fix this issue by looking at the Satisfaction section, where there is now a [+Generator] button which adds a Nuclear Reactor with the correct fuel rod at the exact amount required to create that amount of waste.</li>
        </ul>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/waste.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <ul>
          <li>👍 <b>Part Roles</b> - There are new indicators of what roles a part plays in a factory, they can be either a "Product", "Byproduct", "Import" or an "Internal" part. This makes it much easier to understand the way the part interacts with the factory.</li>
          <li>🔧 <b>TRIM / SATISFY button fixes</b> - A lot of edge cases with the buttons were fixed, and take into better account byproducts and imports across the factory. This should now mean they only show up when appropriate to do so. This also fixed bugs with the buttons doing nothing when pressed, which was due to:</li>
          <li>👍 <b>"MANUALLY FIX" indicators</b> - Under certain conditions (such as there being multiple products, imports or byproducts of a same part), we are unsure / unable to automatically fix it as the user may not desire the outcome. Therefore, the user is now prompted to fix the situation manually.</li>
          <li>🔧 <b>Generator Power &amp; Building math</b> - When there were multiple generator groups of the same building and fuel type, the planner was not correctly calculating the power produced or the buildings needed.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>Miscellaneous changes</h2>
        <p>A whole raft of other features / changes / fixes were implemented, so rather than going into detail of them, here they are rapid-fire style:</p>
        <ul>
          <li>🔧 🔧 Fixed a <b>Planner breaking bug</b> surrounding how Chrome, Edge and other Chrome derivatives renders the mobile tray (which completely broke the planner in those browsers).</li>
          <li>👍 <b>GameSync</b> now drops factories out of sync when their power generators change.</li>
          <li>👍 <b>Tab Memory</b> - changing tabs and reloading will remember the last opened tab (before it used to always open the first one).</li>
          <li>👍 <b>Performance Improvements</b> - what seems like a never ending battle, we have improved performance yet again by:
            <ul class="mb-0">
              <li>Ensuring the hidden factories UI is actually hidden itself when a factory is expanded (reducing rendering time slightly).</li>
              <li>Changes to the factory have been reduced, meaning the UI framework has to do less changes (more to come on this).</li>
              <li>Removed various bits of dead code that slowed the calculation of factories down.</li>
            </ul>
          </li>
          <li>👍 The "too many factories open" banner can be dismissed until page reload.</li>
          <li>🔧 Template manager can now open multiple templates without requiring a page reload.</li>
          <li>🔧 Packaged Rocket Fuel now shows the correct icon.</li>
        </ul>

      </v-col>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">

</script>

<style lang="scss" scoped>

h1,h2,h3,h4,h5,h6 {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

div,p,ul,video {
  margin-bottom: 1rem;
}

ul {
  margin-left: 0;
  margin-bottom: 1rem;

  li {
    margin-left: 1rem;
  }
}

hr {
  border-style: solid;
  border-width: 1px;
  color: #7c7c7c !important;
  opacity: 1 !important;

  &.subsection {
    border-style: dashed;
  }
}

</style>
