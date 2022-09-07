describe("Test that the button for changing font size works.", () => {

  it("should increase font size when clicking on the '.increase-font-size' button.", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    cy.get(".font-size").first().click();

    // Check that by default, the displayed font size is 16.
    cy.get(".font-size-text").invoke("text").then((text) => {
      expect(text.trim()).equal("16");
    });

    // Click on the button to increase font size.
    cy.get(`[aria-label="increase-font-size"]`).click();

    // Check that now, the displayed font size is 17.
    cy.get(".font-size-text").invoke("text").then((text) => {
      expect(text.trim()).equal("17");
    });

    // Check that the font size is also set to 17 in the CSS.
    cy.get("html").then((elem) => {
      expect(elem[0].style.fontSize.replace("px", "")).equal("17");
    });
  });

  it("should decrease font size when clicking on the '.decrease-font-size' button.", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    cy.get(".font-size").first().click();

    // Check that by default, the displayed font size is 16.
    cy.get(".font-size-text").invoke("text").then((text) => {
      expect(text.trim()).equal("16");
    });

    // Click on the button to decrease font size.
    cy.get(`[aria-label="decrease-font-size"]`).click();

    // Check that now, the displayed font size is 15.
    cy.get(".font-size-text").invoke("text").then((text) => {
      expect(text.trim()).equal("15");
    });

    // Check that the font size is also set to 15 in the CSS.
    cy.get("html").then((elem) => {
      expect(elem[0].style.fontSize.replace("px", "")).equal("15");
    });
  });

  it("should reset the font size when clicking on the reset button.", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    cy.get(".font-size").first().click();

    // Click on the button to increase font size.
    cy.get(`[aria-label="increase-font-size"]`).click();

    // Check that the font size is set to 17 in the CSS.
    cy.get("html").then((elem) => {
      expect(elem[0].style.fontSize.replace("px", "")).equal("17");
    });

    // Click on the reset button.s
    cy.get(".icon-button").eq(5).click(); // The reset button is at index 5.

    // Check that now, the displayed font size has returned to 16.
    cy.get(".font-size-text").invoke("text").then((text) => {
      expect(text.trim()).equal("16");
    });

    // Check that the font size has also returned to 16 in the CSS.
    cy.get("html").then((elem) => {
      expect(elem[0].style.fontSize.replace("px", "")).equal("16");
    });
  });
});

describe("Test that the search bar works.", () => {

  it("should display the correct documentation page when searching for an existing term.", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    cy.get(".search-button").first().click();

    cy.get(".search-input").type("Alive");

    cy.get(".search-result-item").first().click();

    expect(cy.get("h1").first().contains("Alive"));
    expect(cy.get(".class-description").should("have.text", "Donec imperdiet dignissim semper. Sed vehicula purus dui, eget porta lectus convallis sagittis. Suspendisse ac lectus dignissim, tincidunt nisi quis, gravida metus."));
  });
});


describe("Test that the button for changing theme works.", () => {

  it("should change theme", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    // As written in the jsdoc.config.json, the default theme is dark.
    cy.get(".theme-toggle").first().click();

    // After clicking on the button, the theme should be light.
    cy.get("body").invoke("attr", "class").then((nextClassAttr) => {
      expect(nextClassAttr).to.equal("light");
    });

    cy.get(".theme-toggle").first().click();
    // After clicking on the button a second time, the theme should be back to dark.
    cy.get("body").invoke("attr", "class").then((nextClassAttr) => {
      expect(nextClassAttr).to.equal("dark");
    });

  });
});

describe("Test the Table Of Content (TOC) behavior.", () => {

  it("should open the correct page when clicking on a link and the TOC entry should be active.", () => {
    cy.viewport(1920, 1080);
    cy.visit(Cypress.env("VISIT_URL"));

    cy.get(".toc-link").eq(1).invoke("attr", "class").then((classAttr) => {
      expect(classAttr).to.not.contains("is-active-link");
    });

    cy.get(".toc-link").eq(1).click(); // Demo

    cy.url().should("eq", `${Cypress.env("VISIT_URL")}#demo`);
    cy.get(".toc-link").eq(1).invoke("attr", "class").then((classAttr) => {
      expect(classAttr).to.contains("is-active-link");
    });
  });

  // it("should set the TOC entry active, even when thee entry is at the bottom of the document.", () => {
  //   // see https://github.com/ankitskvmdam/clean-jsdoc-theme/issues/140
  //   cy.viewport(1920, 1080);
  //   cy.visit(Cypress.env("VISIT_URL"));
  //
  //   cy.get(".toc-link").last().invoke("attr", "class").then((classAttr) => {
  //     expect(classAttr).to.not.contains("is-active-link");
  //   });
  //
  //   cy.get(".toc-link").last().click(); // Demo
  //
  //   cy.url().should("eq", `${Cypress.env("VISIT_URL")}#license`);
  //   cy.get(".toc-link").last().invoke("attr", "class").then((classAttr) => {
  //     expect(classAttr).to.contains("is-active-link");
  //   });
  // });

});

describe("Test misc features", () => {
  it("Clicking on the title in the sidebar should redirects to the home page.", () => {
    // https://github.com/ankitskvmdam/clean-jsdoc-theme/issues/124
    cy.viewport(1920, 1080);
    cy.log(Cypress.env("VISIT_URL"))

    // Visit a page other than the home page.
    cy.visit(`${Cypress.env("VISIT_URL")}Alive.html`);
    expect(cy.get("h1").first().contains("Alive"));

    // Click on the sidebar title.
    cy.get(".sidebar-title").first().click();

    // We should be redirected to the home page.
    expect(cy.url().should('eq', Cypress.env("VISIT_URL")))
    expect(cy.get("h1").first().contains("clean-jsdoc-theme"));
  });
});