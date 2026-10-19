import assert from "node:assert/strict";
import test from "node:test";
import { isolateElements, lockPageScroll } from "../lib/page-scroll-lock.ts";

function fixture(classicScrollbar = false) {
  const properties = new Map<string, { value: string; priority: string }>();
  const style = {
    getPropertyValue: (name: string) => properties.get(name)?.value || "",
    getPropertyPriority: (name: string) => properties.get(name)?.priority || "",
    setProperty(name: string, value: string, priority = "") {
      if (name === "overflow") {
        this.setProperty("overflow-x", value, priority);
        this.setProperty("overflow-y", value, priority);
      } else properties.set(name, { value, priority });
    },
    removeProperty(name: string) {
      if (name === "overflow") {
        properties.delete("overflow-x");
        properties.delete("overflow-y");
      } else properties.delete(name);
    },
  };
  const rootStyle = { ...style };
  const rootProperties = new Map<string, string>();
  rootStyle.getPropertyValue = (name) => rootProperties.get(name) || "";
  rootStyle.setProperty = (name, value) => {
    rootProperties.set(name, value);
  };
  rootStyle.removeProperty = (name) => {
    rootProperties.delete(name);
  };
  const owner = {
    body: { style },
    documentElement: { style: rootStyle, clientWidth: 1000 },
    defaultView: {
      innerWidth: classicScrollbar ? 1015 : 1000,
      getComputedStyle: () => ({
        scrollbarGutter: rootProperties.get("scrollbar-gutter") || "auto",
      }),
    },
  } as unknown as Document;
  return { owner, style, rootStyle };
}

test("closing a parent before its nested overlay keeps scroll locked until the final release", () => {
  const { owner, style } = fixture();
  style.setProperty("overflow-x", "clip", "important");
  style.setProperty("overflow-y", "auto");
  const parent = lockPageScroll(owner),
    child = lockPageScroll(owner);
  parent();
  parent();
  assert.equal(style.getPropertyValue("overflow-y"), "hidden");
  child();
  child();
  assert.equal(style.getPropertyValue("overflow-x"), "clip");
  assert.equal(style.getPropertyPriority("overflow-x"), "important");
  assert.equal(style.getPropertyValue("overflow-y"), "auto");
  assert.equal(style.getPropertyPriority("overflow-y"), "");
});

test("closing a child first and reopening does not strand scroll or affect another document", () => {
  const first = fixture(),
    second = fixture();
  const parent = lockPageScroll(first.owner),
    child = lockPageScroll(first.owner),
    other = lockPageScroll(second.owner);
  child();
  parent();
  assert.equal(first.style.getPropertyValue("overflow-y"), "");
  assert.equal(second.style.getPropertyValue("overflow-y"), "hidden");
  const reopened = lockPageScroll(first.owner);
  reopened();
  other();
  assert.equal(first.style.getPropertyValue("overflow-x"), "");
  assert.equal(second.style.getPropertyValue("overflow-y"), "");
});

test("classic scrollbars reserve space only while locked and preserve an existing stable gutter", () => {
  const { owner, rootStyle } = fixture(true);
  const release = lockPageScroll(owner);
  assert.equal(rootStyle.getPropertyValue("scrollbar-gutter"), "stable");
  release();
  assert.equal(rootStyle.getPropertyValue("scrollbar-gutter"), "");
  rootStyle.setProperty("scrollbar-gutter", "stable both-edges");
  lockPageScroll(owner)();
  assert.equal(
    rootStyle.getPropertyValue("scrollbar-gutter"),
    "stable both-edges",
  );
});

test("nested background isolation survives out-of-order cleanup and retains pre-existing inert state", () => {
  const background = { inert: false } as HTMLElement,
    alreadyInert = { inert: true } as HTMLElement;
  const parent = isolateElements([background, background, alreadyInert]);
  const child = isolateElements([background, alreadyInert]);
  parent();
  parent();
  assert.equal(background.inert, true);
  child();
  child();
  assert.equal(background.inert, false);
  assert.equal(alreadyInert.inert, true);
});
