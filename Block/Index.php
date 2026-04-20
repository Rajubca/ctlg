<?php
namespace Shatchi\Catalogue3\Block;

use Magento\Framework\View\Element\Template;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

class Index extends Template
{
    /**
     * @var ScopeConfigInterface
     */
    protected $scopeConfig;

    public function __construct(
        Template\Context $context,
        array $data = []
    ) {
        $this->scopeConfig = $context->getScopeConfig();
        parent::__construct($context, $data);
    }



    protected function _prepareLayout()
    {
        parent::_prepareLayout();
        $title = $this->scopeConfig->getValue(
            'shatchi_catalogue3/general/meta_title',
            ScopeInterface::SCOPE_STORE
        );
        if ($title) {
            $this->pageConfig->getTitle()->set($title);
        }
        return $this;
    }

    public function getCatalogueTitle()
    {
        $title = $this->scopeConfig->getValue(
            'shatchi_catalogue3/general/catalogue_title',
            ScopeInterface::SCOPE_STORE
        );
        return $title ? $title : 'Shatchi';
    }

    public function isShareEnabled()
    {
        return $this->scopeConfig->isSetFlag(
            'shatchi_catalogue3/general/enable_share',
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isGotoEnabled()
    {
        return $this->scopeConfig->isSetFlag(
            'shatchi_catalogue3/general/enable_goto',
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isGridEnabled()
    {
        return $this->scopeConfig->isSetFlag(
            'shatchi_catalogue3/general/enable_grid',
            ScopeInterface::SCOPE_STORE
        );
    }
}
