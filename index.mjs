const Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
};
const validNodeTypes = [
    Node.ELEMENT_NODE,
    Node.TEXT_NODE,
    Node.COMMENT_NODE,
];

const getXPath = (element) => {
    const parts = [];
    while (element && validNodeTypes.includes(element.nodeType)) {
        let numberOfPreviousSiblings = 0;
        let hasNextSiblings = false;
        let sibling = element.previousSibling;
        while (sibling) {
            if (sibling.nodeType !== Node.DOCUMENT_TYPE_NODE &&
                sibling.nodeName === element.nodeName) {
                numberOfPreviousSiblings++;
            }
            sibling = sibling.previousSibling;
        }
        sibling = element.nextSibling;
        while (sibling) {
            if (sibling.nodeName === element.nodeName) {
                hasNextSiblings = true;
                break;
            }
            sibling = sibling.nextSibling;
        }
        const nth = numberOfPreviousSiblings || hasNextSiblings
            ? '[' + (numberOfPreviousSiblings + 1) + ']'
            : '';
        let part;
        if ([Node.TEXT_NODE, Node.COMMENT_NODE].includes(element.nodeType)) {
            part = element.nodeName.slice(1) + '()' + nth;
        }
        else {
            part = element.localName + nth;
        }
        parts.push(part);
        element = element.parentNode;
    }
    return parts.length ? '/' + parts.reverse().join('/') : '';
};

const getCSSStyleSheet = (node) => {
    const sheet = node.sheet;
    if (!sheet) {
        return null;
    }
    return {
        cssRules: Array.from(sheet.cssRules).map((cssRule) => {
            return {
                cssText: cssRule.cssText,
            };
        }),
    };
};

const getAttributes = (element) => {
    const attributesObject = {};
    if (!element || !element.attributes) {
        return {};
    }
    return Array.from(element.attributes).reduce((accumulator, attribute) => {
        accumulator[attribute.name] = attribute.value;
        return accumulator;
    }, {});
};

class EnhancedMutationRecord {

    constructor() {
        this.appliersByMutationType = {
            childList: this.applyChildListMutation,
            attributes: this.applyAttributesMutation,
            characterData: this.applyCharacterDataMutation,
        };
        this.sheets = []; //styleSheets || [];
    }
    
    static fromMutationRecord( mutationRecords ) {
        const self = new this();
        self.mutations = this.serializeMutations( mutationRecords );
        return self;
    }

    static serializeMutations( mutations ) {
        return mutations.map((mutation) => {
            return {
                type: mutation.type,
                target: this.serializeNode(mutation.target),
                addedNodes: Array.from(mutation.addedNodes).map(node => {
                    return this.serializeNode(node, { innerHTML: true });
                }),
                removedNodes: Array.from(mutation.removedNodes).map(node => this.serializeNode(node)),
                previousSibling: this.serializeNode(mutation.previousSibling),
                nextSibling: this.serializeNode(mutation.nextSibling),
                attributeName: mutation.attributeName,
                attributeNamespace: mutation.attributeNamespace,
            };
        });
    }

    static serializeNode( node, include ) {
        if (!node) return null;
        const info = {
            type: node.nodeType,
            name: node.nodeName,
            tagName: node.tagName,
            value: node.nodeValue,
            attributes: getAttributes(node),
            xpath: getXPath(node),
            data: node.data,
        };
        if (include === null || include === void 0 ? void 0 : include.innerHTML) {
            info.innerHTML = node.innerHTML;
        }
        if (node.sheet) {
            info.sheet = (0, getCSSStyleSheet)(node);
        }
        return info;
    }

    getNodeByXPath(xpath, aDocument) {
        const document = aDocument; //this.dom.window.document;
        let node;
        try {
            node = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        catch (error) {
            node = null;
        }
        return node;
    }
    
    getTargetInDomFromMutation(mutation, aDocument) {
        const target = mutation.target;
        if (!target) {
            throw new Error('Mutation is missing target element');
        }
        const targetXPath = target.xpath;
        if (!target.xpath) {
            throw new Error('Mutation target is missing an XPath value');
        }
        const targetInDom = this.getNodeByXPath(targetXPath, aDocument);
        if (!targetInDom) {
            return null;
        }
        return targetInDom;
    }
    
    applyChildListMutation(mutation, aDocument) {
        let _a, _b;
        const targetInDom = this.getTargetInDomFromMutation(mutation, aDocument);
        if (!targetInDom) {
            return;
        }
        let previousSiblingInDom;
        if ((_a = mutation.previousSibling) === null || _a === void 0 ? void 0 : _a.xpath) {
            previousSiblingInDom = this.getNodeByXPath(mutation.previousSibling.xpath, aDocument);
        }
        let nextSiblingInDom;
        if ((_b = mutation.nextSibling) === null || _b === void 0 ? void 0 : _b.xpath) {
            nextSiblingInDom = this.getNodeByXPath(mutation.nextSibling.xpath, aDocument);
        }
        mutation.removedNodes.forEach((removedNode) => {
            let _a, _b;
            if (removedNode === null || removedNode === void 0 ? void 0 : removedNode.sheet) {
                this.sheets = this.sheets.filter(sheet => {
                    return JSON.stringify(sheet) !== JSON.stringify(removedNode === null || removedNode === void 0 ? void 0 : removedNode.sheet);
                });
            }
            let removedNodeInDom;
            if (removedNode === null || removedNode === void 0 ? void 0 : removedNode.xpath) {
                removedNodeInDom = this.getNodeByXPath(removedNode.xpath, aDocument);
                if (removedNodeInDom) {
                    removedNodeInDom.remove();
                    return;
                }
            }
            let childInDomToRemove;
            if (previousSiblingInDom) {
                childInDomToRemove = previousSiblingInDom.nextSibling;
            }
            else if (nextSiblingInDom) {
                childInDomToRemove = nextSiblingInDom.previousSibling;
            }
            else {
                childInDomToRemove = targetInDom.firstChild;
            }
            if (!childInDomToRemove && !((_a = removedNode === null || removedNode === void 0 ? void 0 : removedNode.xpath) === null || _a === void 0 ? void 0 : _a.startsWith('/html'))) {
                removedNodeInDom = this.getNodeByXPath((((_b = mutation.target) === null || _b === void 0 ? void 0 : _b.xpath) || '') + ((removedNode === null || removedNode === void 0 ? void 0 : removedNode.xpath) || ''), aDocument);
                if (removedNodeInDom) {
                    removedNodeInDom.remove();
                    return;
                }
            }
            if (!childInDomToRemove) {
                return;
            }
            targetInDom.removeChild(childInDomToRemove);
        });
        mutation.addedNodes.forEach((addedNode) => {
            var _a, _b;
            const addedNodeAlreadyInDom = this.getNodeByXPath((addedNode === null || addedNode === void 0 ? void 0 : addedNode.xpath) || '', aDocument);
            const document = aDocument;
            let newNodeInDom;
            if (addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName) {
                if (['svg', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect'].includes((_a = addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase())) {
                    newNodeInDom = document.createElementNS('http://www.w3.org/2000/svg', addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName);
                }
                else {
                    newNodeInDom = document.createElement(addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName);
                }
            }
            else if ((addedNode === null || addedNode === void 0 ? void 0 : addedNode.type) === NodeType.TEXT_NODE) {
                newNodeInDom = document.createTextNode((addedNode === null || addedNode === void 0 ? void 0 : addedNode.value) || '');
            }
            else if ((addedNode === null || addedNode === void 0 ? void 0 : addedNode.type) === NodeType.COMMENT_NODE) {
                newNodeInDom = document.createComment((addedNode === null || addedNode === void 0 ? void 0 : addedNode.value) || '');
            }
            else {
                throw new Error(`Could not add node (with XPath ${addedNode === null || addedNode === void 0 ? void 0 : addedNode.xpath}) because it is of unrecognizable type`);
            }
            const addedNodeAttributes = addedNode === null || addedNode === void 0 ? void 0 : addedNode.attributes;
            Object.keys(addedNodeAttributes || []).forEach((attributeName) => {
                if (!Object.keys(addedNodeAttributes).includes(attributeName)) {
                    return;
                }
                const attributeValue = addedNodeAttributes[attributeName];
                newNodeInDom.setAttribute(attributeName, attributeValue);
            });
            newNodeInDom.innerHTML = (addedNode === null || addedNode === void 0 ? void 0 : addedNode.innerHTML) || '';
            if (addedNode.sheet) {
                this.sheets.push(addedNode.sheet);
            }
            if (previousSiblingInDom) {
                targetInDom.insertBefore(newNodeInDom, previousSiblingInDom.nextSibling);
            }
            else if (nextSiblingInDom) {
                targetInDom.insertBefore(newNodeInDom, nextSiblingInDom);
            }
            else {
                const indexFromXPathObject = /\[([0-9])\]$/.exec((addedNode === null || addedNode === void 0 ? void 0 : addedNode.xpath) || '');
                if (indexFromXPathObject) {
                    const indexFromXPath = parseInt(indexFromXPathObject[1]);
                    if ([Node.TEXT_NODE, Node.COMMENT_NODE].includes(addedNode === null || addedNode === void 0 ? void 0 : addedNode.type)) {
                        const textOrCommentChildNodes = Array.from(targetInDom.childNodes)
                            .filter(node => (node === null || node === void 0 ? void 0 : node.nodeType) === (addedNode === null || addedNode === void 0 ? void 0 : addedNode.type));
                        if (textOrCommentChildNodes.length > indexFromXPath) {
                            targetInDom.insertBefore(newNodeInDom, textOrCommentChildNodes[indexFromXPath]);
                        }
                        else {
                            targetInDom.appendChild(newNodeInDom);
                        }
                    }
                    else {
                        const elementChildNodes = Array.from(targetInDom.children)
                            .filter((node) => { var _a, _b; return ((_a = node === null || node === void 0 ? void 0 : node.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === ((_b = addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName) === null || _b === void 0 ? void 0 : _b.toLowerCase()); });
                        if (elementChildNodes.length > indexFromXPath) {
                            targetInDom.insertBefore(newNodeInDom, elementChildNodes[indexFromXPath]);
                        }
                        else {
                            targetInDom.appendChild(newNodeInDom);
                        }
                    }
                }
                else {
                    targetInDom.appendChild(newNodeInDom);
                }
            }
            if (addedNodeAlreadyInDom && (addedNodeAlreadyInDom.isEqualNode(newNodeInDom) ||
                ((_b = addedNode === null || addedNode === void 0 ? void 0 : addedNode.tagName) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === 'body')) {
                addedNodeAlreadyInDom.remove();
            }
        });
    }
    
    applyAttributesMutation(mutation) {
        var _a, _b, _c;
        const targetInDom = this.getTargetInDomFromMutation(mutation);
        if (!targetInDom) {
            return;
        }
        const targetAttributes = (_a = mutation.target) === null || _a === void 0 ? void 0 : _a.attributes;
        if (!targetAttributes) {
            throw new Error(`Attributes of mutation target (with XPath ${(_b = mutation.target) === null || _b === void 0 ? void 0 : _b.xpath}) are missing`);
        }
        const mutatedAttributeName = mutation.attributeName;
        if (!mutatedAttributeName) {
            throw new Error(`Mutated attribute name of target (with XPath ${(_c = mutation.target) === null || _c === void 0 ? void 0 : _c.xpath}) is missing`);
        }
        if (!Object.keys(targetAttributes).includes(mutatedAttributeName)) {
            targetInDom.removeAttribute(mutatedAttributeName);
            return;
        }
        const mutatedAttributeValue = targetAttributes[mutatedAttributeName];
        targetInDom.setAttribute(mutatedAttributeName, mutatedAttributeValue);
    }
    
    applyCharacterDataMutation(mutation) {
        var _a;
        const targetInDom = this.getTargetInDomFromMutation(mutation);
        if (!targetInDom) {
            return;
        }
        targetInDom.replaceData(0, targetInDom.data.length, ((_a = mutation.target) === null || _a === void 0 ? void 0 : _a.data) || '');
    }
    
    mutate( aDocument ) {
        const appliers = this.mutations.map( m => this.appliersByMutationType[m.type].bind(this, m, aDocument) );
        appliers.forEach( m => m() )
        //applier(mutation);
    }
    
    applyMutations(serializedMutations) {
        serializedMutations.forEach(this.applyMutation.bind(this));
    }

}

export default EnhancedMutationRecord;