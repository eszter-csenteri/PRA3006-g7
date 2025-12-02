// Stores the most recent SPARQL query result (JSON format)
let lastSparqlData = null;

// Keeps track of whether the chart uses linear or logarithmic scale
let currentScaleType = "linear"; // can be: "linear" or "log"


//Converts SPARQL JSON results into an HTML <table>
function renderResults(data) {

  // Extract the list of result rows (bindings).
  // If data.results or data.results.bindings does not exist, default to an empty array.
  const bindings = data.results?.bindings || [];

  // If the query returned no rows, just display a simple message.
  if (bindings.length === 0) {
    return '<p>No results.</p>';
  }

  // Determine which variables/columns to display.
  // Prefer data.head.vars, otherwise fall back to keys from the first row.
  const vars = data.head?.vars || Object.keys(bindings[0] || {});

  // Start building the HTML table (white text, small font).
  let html = '<table style="border-collapse:collapse; color:white; font-size:0.9rem;">';

  // -----------------------------
  // TABLE HEADER
  // -----------------------------
  html += '<thead><tr>';

  // For each variable name, add a <th> header cell.
  vars.forEach(v => {
    html += `<th style="border:1px solid #555; padding:4px;">${escapeHtml(v)}</th>`;
  });

  html += '</tr></thead><tbody>';

  // -----------------------------
  // TABLE BODY — each SPARQL row
  // -----------------------------
  bindings.forEach(row => {
    html += '<tr>';

    // For each column variable, extract the SPARQL value
    vars.forEach(v => {
      const cell = row[v];             // SPARQL binding object (type, value, datatype...)
      const value = cell ? cell.value : '';  // fallback empty string if not present
      let cellHtml = escapeHtml(value);      // safely escape HTML chars

      // If the cell is a URI, convert it into a clickable hyperlink
      if (cell && cell.type === 'uri' && value) {
        const safeUri = escapeHtml(value);
        cellHtml = `<a href="${safeUri}" target="_blank" style="color:#7fc5ff;">${safeUri}</a>`;
      }

      // Add the table cell to the row
      html += `<td style="border:1px solid #555; padding:4px;">${cellHtml}</td>`;
    });

    html += '</tr>';
  });

  html += '</tbody></table>';

  // Return complete HTML string to be inserted into the page
  return html;
}
//  Converts unsafe characters (<, >, &, etc.) into safe HTML.
//           Prevents broken markup + protects against XSS.
// -----------------------------------------------------
function escapeHtml(text) {
  // Create a hidden div and assign textContent.
  // The browser automatically converts unsafe characters.
  const div = document.createElement('div');

  // Ensure "null" and "undefined" turn into empty string
  div.textContent = text == null ? '' : String(text);

  // innerHTML returns the escaped version
  return div.innerHTML;
}

  // ---------- SPARQL RUNNER ----------
  async function runSparql() { // async function run parrarel with other functions so it doesnt freeze while waiting for data
    const endpoint = document.getElementById('endpoint').value.trim();//get html element. value to get it, trim to remove spaces
    const query = document.getElementById('query').value.trim(); 
    const resultsDiv = document.getElementById('results');

    if (!endpoint || !query) { //check if endpoint and query are empty
    resultsDiv.innerHTML = '<p style="color:red;">Endpoint and query required.</p>';
    return;
    }

    resultsDiv.innerHTML = '<p>Loading…</p>'; // show big red error if no endpoint or query

    let url; //declare url variable
    try {
    url = new URL(endpoint); // try to create new URL object from endpoint string
    } catch (e) { // catch error if invalid URL
    resultsDiv.innerHTML = `<p style="color:red;">Invalid endpoint URL.</p>`; // show error in results div
    console.error('Invalid endpoint URL:', endpoint, e); // log error to console for debugging
    return;
    }

    url.searchParams.append('query', query); // append query parameter to URL
    url.searchParams.append('format', 'json'); // request json format



     try { // try block to catch fetch and parsing errors
    console.log('Sending SPARQL request to:', url.toString());

    const response = await fetch(url.toString(), { // fetch data from url
        method: 'GET', // use GET method
        headers: { 'Accept': 'application/sparql-results+json' } // set Accept header to request SPARQL JSON
    });

    console.log('Response status:', response.status); // log response status for debugging

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('SPARQL JSON result:', data);

    //  STORE SPARQL DATA globally for chart & interactions
    lastSparqlData = data; // store latest data

    //  Render table
    resultsDiv.innerHTML = renderResults(data); // render table in results div

    //  Draw graph
    if (typeof drawGraphFromSparql === 'function') { // check if function is defined
        drawGraphFromSparql(data);
    } else {
        console.warn('drawGraphFromSparql is not defined.');
    }

         //  Initialize selectivity chart molecule dropdown
    initChartDataFromSparql(data);

    //  Reset view to TABLE by default
    
    document.getElementById("viewSelector").value = "table";
    document.getElementById("tableContainer").style.display = "block";
    document.getElementById("graphContainer").style.display = "none"; // hide graph
    document.getElementById("chartContainer").style.display = "none";
    } catch (err) { // catch errors during SPARQL request and processing
    console.error('SPARQL error:', err);
    resultsDiv.innerHTML =
        `<p style="color:red;">Error: ${escapeHtml(err.message)}</p>`;
    }
}

  // ---------- GRAPH BUILDING ----------

// Converts SPARQL query results into a graph structure with nodes and links
    function buildGraphFromSparql(data) {
    // Extract the bindings array from SPARQL results, default to empty array if not present
        const bindings = data.results?.bindings || [];
        // Map to store unique nodes, keyed by their ID to avoid duplicates
        const nodeMap = new Map();
        // Array to store all the relationships (edges) between nodes
        const links = [];

    // Helper function to create or retrieve a node
    function addNode(id, label, type) {
        // Skip if no ID provided
        if (!id) return null;
        
        // Only add the node if it doesn't already exist in the map
        if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, label, type });
        }
        
        // Return the node from the map
        return nodeMap.get(id);
    }

    // Process each row of SPARQL results to build the graph
    bindings.forEach(row => {  //bindings.forEach to loop through each row of the SPARQL results
        // Extract molecule data from the SPARQL result row
        const moleculeURI = row.molecule?.value;
        const molName = row.molName?.value || moleculeURI;

        // Extract parent molecule data (falls back to URI if name not available)
        const parentURI = row.molecule2?.value;
        const mol2Name = row.mol2Name?.value || parentURI; // fallback to URI if name not available

        // Extract target data (falls back to URI if name not available)
        const targetURI = row.target?.value;
        const targetName = row.targetName?.value || targetURI;

        // Create or retrieve nodes for all three entities
        const moleculeNode = addNode(moleculeURI, molName, "molecule");
        const parentNode = addNode(parentURI, mol2Name, "parent");
        const targetNode = addNode(targetURI, targetName, "target");

        // Create a link between molecule and its parent molecule if both exist
        if (moleculeNode && parentNode) {
        links.push({
            source: moleculeNode.id,
            target: parentNode.id,
            relation: "hasParentMolecule"
        });
        }

        // Create a link between parent molecule and its target if both exist
        if (parentNode && targetNode) {
        links.push({
            source: parentNode.id,
            target: targetNode.id,
            relation: "hasTarget"
        });
        }
    });


    return {
      nodes: Array.from(nodeMap.values()),
      links
    };
  }

  // ---------- GRAPH DRAWING ----------
  function drawGraphFromSparql(data) {
    // Convert SPARQL JSON results into a graph structure of {nodes, links}
    const graph = buildGraphFromSparql(data);

    // Select the SVG element where the graph will be drawn
    const svg = d3.select("#graph");

    // Clear everything inside the SVG before drawing a new graph
    svg.selectAll("*").remove();

    // Read SVG size from <svg width="" height="">
    const width = +svg.attr("width");
    const height = +svg.attr("height");

    // Color scale for node types (molecule, parent, target)
    const color = d3.scaleOrdinal()
      .domain(["molecule", "parent", "target"])
      .range(["#ffcc00", "#66ccff", "#ff6699"]);

    // ---------- LEGEND ----------
    // Define what appears in the legend
    const legendData = [
      { type: "molecule", label: "Molecule (molName)" },
      { type: "parent", label: "Parent Molecule (mol2Name)" },
      { type: "target", label: "Target (targetName)" }
    ];

    // Create a group <g> to hold the legend items
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", "translate(20, 20)");

    // Draw the colored dots for the legend
    legend.selectAll("legend-dots")
      .data(legendData)
      .enter()
      .append("circle")
      .attr("cx", 0)
      .attr("cy", (d, i) => i * 22) // vertical spacing between legend entries
      .attr("r", 7)
      .style("fill", d => color(d.type));

    // Labels of the legend
    legend.selectAll("legend-labels")
      .data(legendData)
      .enter()
      .append("text")
      .attr("x", 15)            // small offset from dot
      .attr("y", (d, i) => i * 22 + 4)
      .style("fill", "white")
      .style("font-size", "14px")
      .text(d => d.label);

    // ---------- FORCE SIMULATION (physics engine for the graph) ----------
    const simulation = d3.forceSimulation(graph.nodes)
      // Links (edges) have a set distance and identify nodes by ID
      .force("link", d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(80))
      // Charge pushes nodes apart (negative = repulsion)
      .force("charge", d3.forceManyBody().strength(-120))
      // Centering force pulls the whole graph toward the middle
      .force("center", d3.forceCenter(width / 2, height / 2))
      // Soft horizontal and vertical pull to keep nodes stable
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    // ---------- DRAW LINKS ----------
    const link = svg.append("g")
      .attr("stroke", "#aaa")
      .attr("stroke-width", 1)
      .selectAll("line")
      .data(graph.links)
      .enter()
      .append("line"); // lines between nodes

    // ---------- DRAW NODES (circles & labels) ----------
    const node = svg.append("g")
      .selectAll("g")
      .data(graph.nodes)
      .enter()
      .append("g")
      // Drag behavior to manually reposition nodes
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Node circle
    node.append("circle")
      .attr("r", 8)
      .attr("fill", d => color(d.type));

    // Tooltip (hover text)
    node.append("title")
      .text(d => d.label);

    // Visible node label (text next to each node)
    node.append("text")
      .attr("x", 10)
      .attr("y", 3)
      .attr("fill", "#ffffff")
      .attr("font-size", "10px")
      .text(d => d.label);

    // ---------- TICK FUNCTION: updates positions every frame ----------
    simulation.on("tick", () => {
      // Update link coordinates based on the simulation’s calculations
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      // Update node <g> position using translate()
      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // ---------- DRAG HANDLERS ----------
    function dragstarted(event, d) {
      // If simulation is idle, restart with slight energy
      if (!event.active) simulation.alphaTarget(0.3).restart();
      // Fix node position (stop physics temporarily)
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      // Move fixed position to mouse x/y
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      // Lower simulation energy
      if (!event.active) simulation.alphaTarget(0);
      // Release the node so simulation can reposition freely
      d.fx = null;
      d.fy = null;
    }
}



  // ---------- CHART DATA PREP ----------
  function initChartDataFromSparql(data) {
    // Extract the SPARQL bindings safely.
    // If results or bindings don't exist, default to an empty array.
    const bindings = data.results?.bindings || [];

    // Create a Map to group results by parent molecule (molecule2).
    // Key   = parent molecule URI
    // Value = { label: human-readable name, rows: all SPARQL rows for this parent }
    const byMol2 = new Map();

    // Loop through each SPARQL row
    bindings.forEach(row => {
      // Extract the parent molecule URI and name
      const parentURI = row.molecule2?.value;
      const mol2Name = row.mol2Name?.value || parentURI; // fallback to URI as label

      // If missing parent molecule, skip the row
      if (!parentURI) return;

      // If we haven't encountered this parent molecule, initialize the bucket
      if (!byMol2.has(parentURI)) {
        byMol2.set(parentURI, { label: mol2Name, rows: [] });
      }

      // Push the full row into this parent molecule's bucket
      byMol2.get(parentURI).rows.push(row);
    });

    // Find the dropdown <select> where the user chooses parent molecule
    const selector = document.getElementById("moleculeSelector");
    if (!selector) return; // If it does not exist, nothing more to do

    // Clear dropdown to avoid stacking options after repeated queries
    selector.innerHTML = "";

    // Populate <select> with an <option> for each parent molecule (mol2)
    for (const [uri, info] of byMol2.entries()) {
      const opt = document.createElement("option");
      opt.value = uri;        // the SPARQL URI of the parent molecule
      opt.textContent = info.label; // display readable label
      selector.appendChild(opt);
    }

    // If we have at least one parent molecule, auto-draw chart for the first option
    const first = selector.options[0];
    if (first) {
      // drawSelectivityChart(data, selectedParentURI, scaleType)
      drawSelectivityChart(data, first.value, currentScaleType);
    } else {
      // If no data exists, clear the chart area completely
      const svg = d3.select("#chart");
      svg.selectAll("*").remove();
    }
}

  // ---------- DRAW SELECTIVITY BAR CHART ----------
  function drawSelectivityChart(data, molecule2URI, scaleType = "linear") {
    // Extract SPARQL result rows safely
    const bindings = data.results?.bindings || [];

    // ---- 1. FILTER DATA FOR THE SELECTED PARENT MOLECULE ----
    // Only keep rows where molecule2 matches the selected URI
    const rows = bindings.filter(row => row.molecule2?.value === molecule2URI);

    // ---- 2. PROCESS SELECTIVITY VALUES ----
    // Convert SPARQL rows into simpler objects for plotting
    const chartData = rows.map(row => {
      const targetName = row.targetName?.value || row.target?.value || "unknown";

      const selRaw = row.Selectivity_vs_best?.value;   // SPARQL string (Ki/KiBest)
      const kiRaw = row.Ki?.value;
      const kiBestRaw = row.KiBest?.value;

      // Parse numeric selectivity value
      let selectivity = selRaw ? parseFloat(selRaw) : NaN;

      // If selectivity is given as KiBest/Ki (vs-best),
      // invert it so that bigger = "more selective"
      if (!isNaN(selectivity) && selectivity !== 0) {
        selectivity = 1 / selectivity;
      }

      return {
        targetName,
        selectivity: selectivity,
        Ki: kiRaw ? parseFloat(kiRaw) : NaN,
        KiBest: kiBestRaw ? parseFloat(kiBestRaw) : NaN
      };

    // Remove entries that are not valid numbers
    }).filter(d => !isNaN(d.selectivity));

    // ---- 3. PREPARE SVG ----
    const svg = d3.select("#chart");
    svg.selectAll("*").remove(); // Clear old chart

    const fullWidth = +svg.attr("width");
    const fullHeight = +svg.attr("height");

    // Margins around the chart area
    const margin = { top: 30, right: 20, bottom: 100, left: 60 };
    const width = fullWidth - margin.left - margin.right;
    const height = fullHeight - margin.top - margin.bottom;

    // Main container <g>
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // If nothing to show, display message
    if (chartData.length === 0) {
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .text("No selectivity data for this molecule.");
      return;
    }

    // ---- 4. DEFINE X SCALE (CATEGORICAL TARGET NAMES) ----
    const x = d3.scaleBand()
      .domain(chartData.map(d => d.targetName)) // each target is one bar
      .range([0, width])
      .padding(0.2);

    // ---- 5. DEFINE Y SCALE (SELECTIVITY) ----
    let y;

    if (scaleType === "log") {
      // Logarithmic y-axis
      // Must provide positive >= limits
      const minVal = d3.min(chartData, d => (d.selectivity > 0 ? d.selectivity : null)) || 0.1;
      const maxVal = d3.max(chartData, d => d.selectivity) || 100;

      y = d3.scaleLog()
        .domain([minVal, maxVal])
        .range([height, 0])
        .nice();

    } else {
      // Linear y-axis
      y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.selectivity) || 1])
        .nice()
        .range([height, 0]);
    }

    // ---- 6. DRAW X AXIS ----
    const xAxis = d3.axisBottom(x);
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis)
      .selectAll("text")
      .attr("transform", "rotate(-45)") // rotate labels to avoid overlap
      .style("text-anchor", "end")
      .attr("fill", "white");

    // ---- 7. DRAW Y AXIS ----
    const yAxis = d3.axisLeft(y);
    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .attr("fill", "white");

    // Set axis line color
    g.selectAll(".axis path, .axis line")
      .attr("stroke", "white");

    // ---- 8. DRAW BARS ----
    g.selectAll(".bar")
      .data(chartData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.targetName))
      .attr("y", d => y(d.selectivity))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.selectivity))
      .attr("fill", "#66ccff");

    // ---- 9. ADD Y LABEL ----
    g.append("text")
      .attr("x", -40)
      .attr("y", -10)
      .attr("fill", "white")
      .text("Selectivity_vs_best");

    // ---- 10. ADD TITLE ----
    g.append("text")
      .attr("x", width / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .text("Target selectivity for chosen parent molecule");
}


// ---- EVENT LISTENER: UPDATE CHART WHEN USER SELECTS DIFFERENT PARENT MOLECULE ----
const molSelector = document.getElementById("moleculeSelector");
if (molSelector) {
  molSelector.addEventListener("change", function () {
    // Only redraw if SPARQL data already loaded
    if (lastSparqlData) {
      drawSelectivityChart(lastSparqlData, this.value, currentScaleType);
    }
  });
}

  // Scale Toggle Buttons
  // ===== SCALE SWITCH BUTTONS (Linear / Log) =====

// Grab the buttons from the DOM
const btnLinear = document.getElementById("btnLinear");
const btnLog = document.getElementById("btnLog");

// Only attach listeners if both buttons exist
if (btnLinear && btnLog) {

    // ---- LINEAR SCALE BUTTON ----
    btnLinear.addEventListener("click", () => {
      // Update global tracking variable
      currentScaleType = "linear";

      // Visual feedback for button states
      btnLinear.style.backgroundColor = "#66ccff"; // active
      btnLog.style.backgroundColor = "#ddd";       // inactive

      // Redraw chart using the currently selected molecule
      const sel = document.getElementById("moleculeSelector");
      if (lastSparqlData && sel && sel.value) {
        drawSelectivityChart(lastSparqlData, sel.value, currentScaleType);
      }
    });

    // ---- LOG SCALE BUTTON ----
    btnLog.addEventListener("click", () => {
      // Update scale type globally
      currentScaleType = "log";

      // Visual feedback for button states
      btnLinear.style.backgroundColor = "#ddd";    // inactive
      btnLog.style.backgroundColor = "#66ccff";    // active

      // Redraw chart
      const sel = document.getElementById("moleculeSelector");
      if (lastSparqlData && sel && sel.value) {
        drawSelectivityChart(lastSparqlData, sel.value, currentScaleType);
      }
    });
}



// ===== VIEW SWITCHER (Table / Graph / Chart) =====

// When user changes the view selector dropdown
document.getElementById("viewSelector").addEventListener("change", function () {
    const view = this.value; // "table", "graph", or "chart"

    
    const tableDiv = document.getElementById("tableContainer");
    const graphDiv = document.getElementById("graphContainer");
    const chartDiv = document.getElementById("chartContainer");

    // Only show the chosen one
    if (view === "table") {
      tableDiv.style.display = "block";
      graphDiv.style.display = "none";
      chartDiv.style.display = "none";

    } else if (view === "graph") {
      tableDiv.style.display = "none";
      graphDiv.style.display = "block";
      chartDiv.style.display = "none";

    } else if (view === "chart") {
      tableDiv.style.display = "none";
      graphDiv.style.display = "none";
      chartDiv.style.display = "block";
    }
});



// ===== RUN QUERY BUTTON =====

// When user clicks the "Run" button, execute the SPARQL query
document.getElementById('run').addEventListener('click', runSparql);



// ===== INITIALIZATION ON PAGE LOAD =====
window.addEventListener('load', async () => {

    // Automatically run the SPARQL query once when page loads
    await runSparql(); 
    // runSparql() will fetch data and also build table + graph + dropdown

    // Set default visible view to the graph view
    const viewSelector = document.getElementById("viewSelector");
    viewSelector.value = "graph";                         // select <option value="graph">
    viewSelector.dispatchEvent(new Event('change'));      // trigger the UI update
});
